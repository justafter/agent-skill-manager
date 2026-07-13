import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import type { SessionAdapter } from './types.js'
import type { SessionEntry, SessionRecord } from '../types.js'
import { activityFromTimestamp, normalizeTitle, snapshotSessionEntries, toPortableRelative, UUID_PATTERN } from '../utils.js'
import { pathExists } from '../../utils/fs.js'

interface ClaudeHistoryItem {
  title?: string
  project?: string
  timestamp?: number
}

export class ClaudeSessionAdapter implements SessionAdapter {
  readonly agent = 'claude' as const
  readonly version = 'claude-projects-v1'

  async scan(sourceRoot: string): Promise<SessionRecord[]> {
    const projectsRoot = path.join(sourceRoot, 'projects')
    if (!(await pathExists(projectsRoot))) return []

    const [history, activeIds] = await Promise.all([
      readHistory(path.join(sourceRoot, 'history.jsonl')),
      readActiveSessionIds(path.join(sourceRoot, 'sessions')),
    ])
    const records: SessionRecord[] = []
    const projects = await readdir(projectsRoot, { withFileTypes: true }).catch(() => [])

    for (const project of projects) {
      if (!project.isDirectory()) continue
      const projectDir = path.join(projectsRoot, project.name)
      const entries = await readdir(projectDir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.jsonl') continue
        const sessionId = path.basename(entry.name, '.jsonl')
        if (!UUID_PATTERN.test(sessionId)) continue

        const transcriptPath = path.join(projectDir, entry.name)
        const companionPath = path.join(projectDir, sessionId)
        const sessionEntries: SessionEntry[] = [
          {
            absolutePath: transcriptPath,
            relativePath: toPortableRelative(path.relative(sourceRoot, transcriptPath)),
            type: 'file' as const,
          },
        ]
        if (await pathExists(companionPath)) {
          const companionInfo = await stat(companionPath).catch(() => undefined)
          if (companionInfo?.isDirectory()) {
            sessionEntries.push({
              absolutePath: companionPath,
              relativePath: toPortableRelative(path.relative(sourceRoot, companionPath)),
              type: 'directory',
            })
          }
        }

        try {
          const snapshot = await snapshotSessionEntries(sessionEntries)
          const historyItem = history.get(sessionId)
          records.push({
            id: sessionId,
            agent: this.agent,
            location: 'agent',
            kind: sessionEntries.length > 1 ? 'session-bundle' : 'transcript',
            title: historyItem?.title,
            workspacePath: historyItem?.project,
            createdAt:
              historyItem?.timestamp !== undefined
                ? new Date(historyItem.timestamp).toISOString()
                : snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
            sizeBytes: snapshot.sizeBytes,
            fileCount: snapshot.fileCount,
            sourceRoot,
            entries: sessionEntries,
            activity: activityFromTimestamp(snapshot.updatedAt, activeIds.has(sessionId)),
            integrity: 'unchecked',
            warnings: [],
          })
        } catch {
          // A single unreadable session must not hide all other sessions.
        }
      }
    }

    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}

async function readHistory(historyPath: string): Promise<Map<string, ClaudeHistoryItem>> {
  const result = new Map<string, ClaudeHistoryItem>()
  if (!(await pathExists(historyPath))) return result
  const input = createReadStream(historyPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    try {
      const item = JSON.parse(line) as Record<string, unknown>
      const sessionId = typeof item.sessionId === 'string' ? item.sessionId : undefined
      if (!sessionId) continue
      result.set(sessionId, {
        title: normalizeTitle(item.display),
        project: typeof item.project === 'string' ? item.project : undefined,
        timestamp: typeof item.timestamp === 'number' ? item.timestamp : undefined,
      })
    } catch {
      // Ignore malformed history lines; the transcript remains discoverable.
    }
  }
  return result
}

async function readActiveSessionIds(sessionsDir: string): Promise<Set<string>> {
  const ids = new Set<string>()
  if (!(await pathExists(sessionsDir))) return ids
  const entries = await readdir(sessionsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue
    try {
      const raw = await readFile(path.join(sessionsDir, entry.name), 'utf8')
      const data = JSON.parse(raw) as Record<string, unknown>
      if (typeof data.sessionId === 'string') ids.add(data.sessionId)
    } catch {
      // Ignore stale or partially written activity markers.
    }
  }
  return ids
}
