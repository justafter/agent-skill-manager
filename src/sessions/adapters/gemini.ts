import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { SessionAdapter } from './types.js'
import type { SessionRecord } from '../types.js'
import { activityFromTimestamp, normalizeTitle, snapshotSessionEntries, UUID_PATTERN } from '../utils.js'
import { pathExists } from '../../utils/fs.js'

export class GeminiSessionAdapter implements SessionAdapter {
  readonly agent = 'gemini' as const
  readonly version = 'gemini-brain-v1'

  async scan(sourceRoot: string): Promise<SessionRecord[]> {
    if (!(await pathExists(sourceRoot))) return []
    const directories = await readdir(sourceRoot, { withFileTypes: true }).catch(() => [])
    const records: SessionRecord[] = []

    for (const directory of directories) {
      if (!directory.isDirectory() || !UUID_PATTERN.test(directory.name)) continue
      const sessionPath = path.join(sourceRoot, directory.name)
      const transcriptPath = path.join(sessionPath, '.system_generated', 'logs', 'transcript.jsonl')
      const fullTranscriptPath = path.join(sessionPath, '.system_generated', 'logs', 'transcript_full.jsonl')
      const hasTranscript = (await pathExists(transcriptPath)) || (await pathExists(fullTranscriptPath))
      const entry = {
        absolutePath: sessionPath,
        relativePath: directory.name,
        type: 'directory' as const,
      }

      try {
        const snapshot = await snapshotSessionEntries([entry])
        records.push({
          id: directory.name,
          agent: this.agent,
          location: 'agent',
          kind: hasTranscript ? 'session-bundle' : 'artifact-only',
          title: await readTaskTitle(path.join(sessionPath, 'task.md')),
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          sizeBytes: snapshot.sizeBytes,
          fileCount: snapshot.fileCount,
          sourceRoot,
          entries: [entry],
          activity: activityFromTimestamp(snapshot.updatedAt),
          integrity: 'unchecked',
          warnings: hasTranscript ? [] : ['该 UUID 目录没有 transcript，当前仅识别到 artifacts。'],
        })
      } catch {
        // Continue scanning other UUID directories.
      }
    }

    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}

async function readTaskTitle(taskPath: string): Promise<string | undefined> {
  if (!(await pathExists(taskPath))) return undefined
  try {
    const content = await readFile(taskPath, 'utf8')
    const firstLine = content
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, '').trim())
      .find(Boolean)
    return normalizeTitle(firstLine)
  } catch {
    return undefined
  }
}
