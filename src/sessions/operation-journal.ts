import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type {
  SessionAction,
  SessionOperationItemLog,
  SessionOperationLog,
  SessionOperationState,
  SessionPlanItem,
} from './types.js'
import { atomicWriteJson, ensureDir, pathExists } from '../utils/fs.js'
import { readFile } from 'node:fs/promises'

export async function createOperationLog(
  archiveDir: string,
  operationId: string,
  planId: string,
  action: SessionAction,
  agent: SessionOperationLog['agent'],
  items: SessionPlanItem[],
): Promise<SessionOperationLog> {
  const now = new Date().toISOString()
  const log: SessionOperationLog = {
    operationId,
    planId,
    action,
    agent,
    createdAt: now,
    updatedAt: now,
    items: items.map((item) => ({
      sessionId: item.sessionId,
      state: item.status === 'ready' ? 'planned' : 'failed',
      sourcePaths: item.sourceEntries.map((entry) => entry.absolutePath),
      targetPath: item.targetPath,
      updatedAt: now,
      error:
        item.status === 'ready'
          ? undefined
          : { code: `SESSION_${item.status.toUpperCase()}`, message: item.reason ?? item.status },
    })),
  }
  await writeOperationLog(archiveDir, log)
  return log
}

export async function updateOperationItem(
  archiveDir: string,
  log: SessionOperationLog,
  sessionId: string,
  state: SessionOperationState,
  error?: SessionOperationItemLog['error'],
): Promise<void> {
  const item = log.items.find((candidate) => candidate.sessionId === sessionId)
  if (!item) return
  const now = new Date().toISOString()
  item.state = state
  item.updatedAt = now
  item.error = error
  log.updatedAt = now
  await writeOperationLog(archiveDir, log)
}

export async function listOperationLogs(archiveDir: string): Promise<SessionOperationLog[]> {
  if (!archiveDir) return []
  const directory = operationDirectory(archiveDir)
  if (!(await pathExists(directory))) return []
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const logs: SessionOperationLog[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    try {
      logs.push(JSON.parse(await readFile(path.join(directory, entry.name), 'utf8')) as SessionOperationLog)
    } catch {
      // Ignore a corrupt journal; archive manifests remain authoritative.
    }
  }
  return logs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function writeOperationLog(archiveDir: string, log: SessionOperationLog): Promise<void> {
  const directory = operationDirectory(archiveDir)
  await ensureDir(directory)
  await atomicWriteJson(path.join(directory, `${log.operationId}.json`), log)
}

function operationDirectory(archiveDir: string): string {
  return path.join(archiveDir, '.agent-skill-manager', 'operations')
}
