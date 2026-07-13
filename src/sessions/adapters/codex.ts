import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import type { SessionAdapter } from './types.js'
import type { SessionRecord } from '../types.js'
import { activityFromTimestamp, normalizeTitle, snapshotSessionEntries, toPortableRelative, UUID_PATTERN } from '../utils.js'
import { pathExists } from '../../utils/fs.js'

interface CodexIndexItem {
  title?: string
  updatedAt?: string
}

interface CodexMetadata {
  id?: string
  cwd?: string
  createdAt?: string
}

const ROLLOUT_ID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i

export class CodexSessionAdapter implements SessionAdapter {
  readonly agent = 'codex' as const
  readonly version = 'codex-rollout-v1'

  async scan(sourceRoot: string): Promise<SessionRecord[]> {
    const index = await readIndex(path.join(sourceRoot, 'session_index.jsonl'))
    const files = [
      ...(await findJsonlFiles(path.join(sourceRoot, 'sessions'))),
      ...(await findJsonlFiles(path.join(sourceRoot, 'archived_sessions'))),
    ]
    const records: SessionRecord[] = []

    for (const filePath of files) {
      const fileNameMatch = ROLLOUT_ID_PATTERN.exec(filePath)
      const metadata = await readMetadata(filePath)
      const sessionId = metadata.id ?? fileNameMatch?.[1]
      if (!sessionId || !UUID_PATTERN.test(sessionId)) continue
      const entry = {
        absolutePath: filePath,
        relativePath: toPortableRelative(path.relative(sourceRoot, filePath)),
        type: 'file' as const,
      }

      try {
        const snapshot = await snapshotSessionEntries([entry])
        const indexItem = index.get(sessionId)
        const updatedAt = indexItem?.updatedAt ?? snapshot.updatedAt
        records.push({
          id: sessionId,
          agent: this.agent,
          location: 'agent',
          kind: 'transcript',
          title: indexItem?.title,
          workspacePath: metadata.cwd,
          createdAt: metadata.createdAt ?? snapshot.createdAt,
          updatedAt,
          sizeBytes: snapshot.sizeBytes,
          fileCount: snapshot.fileCount,
          sourceRoot,
          entries: [entry],
          activity: activityFromTimestamp(snapshot.updatedAt),
          integrity: 'unchecked',
          warnings: [],
        })
      } catch {
        // Continue scanning other rollouts.
      }
    }

    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}

async function readIndex(indexPath: string): Promise<Map<string, CodexIndexItem>> {
  const result = new Map<string, CodexIndexItem>()
  if (!(await pathExists(indexPath))) return result
  const input = createReadStream(indexPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    try {
      const item = JSON.parse(line) as Record<string, unknown>
      if (typeof item.id !== 'string') continue
      result.set(item.id, {
        title: normalizeTitle(item.thread_name),
        updatedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
      })
    } catch {
      // Ignore malformed index lines.
    }
  }
  return result
}

async function findJsonlFiles(root: string): Promise<string[]> {
  if (!(await pathExists(root))) return []
  const results: string[] = []
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) results.push(...(await findJsonlFiles(absolute)))
    else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) results.push(absolute)
  }
  return results
}

async function readMetadata(filePath: string): Promise<CodexMetadata> {
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      try {
        const item = JSON.parse(line) as { type?: unknown; payload?: Record<string, unknown> }
        if (item.type !== 'session_meta' || !item.payload) continue
        return {
          id:
            typeof item.payload.id === 'string'
              ? item.payload.id
              : typeof item.payload.session_id === 'string'
                ? item.payload.session_id
                : undefined,
          cwd: typeof item.payload.cwd === 'string' ? item.payload.cwd : undefined,
          createdAt: typeof item.payload.timestamp === 'string' ? item.payload.timestamp : undefined,
        }
      } catch {
        // Continue until a valid session_meta line is found.
      }
    }
  } finally {
    lines.close()
    input.destroy()
  }
  return {}
}
