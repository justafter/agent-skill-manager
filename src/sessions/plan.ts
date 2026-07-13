import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  SessionAgentId,
  SessionOperationPlan,
  SessionPlanItem,
  SessionPlanResult,
  SessionPlanItemStatus,
} from './types.js'
import { scanSessions } from './scan.js'
import { checksumSessionEntries } from './utils.js'
import { findManifestForRecord } from './manifest.js'
import { loadConfig } from '../core/config.js'
import { pathExists } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'
import { assertSessionEntriesSafe } from './path-guard.js'

const PLAN_TTL_MS = 15 * 60 * 1000
const plans = new Map<string, { plan: SessionOperationPlan; expiresAt: number }>()

export async function createMigratePlan(
  agent: SessionAgentId,
  sessionIds: string[],
  root = process.cwd(),
): Promise<SessionPlanResult> {
  if (sessionIds.length === 0) throw new AppError('VALIDATION_ERROR', 'At least one session ID is required.')
  const scan = await scanSessions(agent, root)
  if (!scan.archiveDir) {
    throw new AppError('SESSION_ARCHIVE_NOT_CONFIGURED', 'Configure a session archive directory before migrating.')
  }

  const items: SessionPlanItem[] = []
  for (const sessionId of uniqueIds(sessionIds)) {
    const record = scan.agentRecords.find((candidate) => candidate.id === sessionId)
    if (!record) throw new AppError('SESSION_NOT_FOUND', `Session not found in ${agent}: ${sessionId}`)
    const targetPath = path.join(scan.archiveDir, 'sessions', agent, sessionId)
    let status: SessionPlanItemStatus = 'ready'
    let reason: string | undefined
    let checksum: `sha256:${string}` | undefined

    try {
      await assertSessionEntriesSafe(agent, record.sourceRoot, record.entries)
    } catch (error) {
      status = 'invalid'
      reason = (error as Error).message
    }

    if (status === 'invalid') {
      // Keep the invalid item in the plan so a bad path cannot hide other selected sessions.
    } else if (record.activity !== 'idle') {
      status = 'busy'
      reason = record.activity === 'busy' ? '会话正在运行或被占用。' : '无法确认会话已经停止写入。'
    } else if (record.integrity === 'invalid') {
      status = 'invalid'
      reason = '会话源数据不完整。'
    } else if (await pathExists(targetPath)) {
      status = 'conflict'
      reason = '归档目录已存在同 ID 会话。'
    } else {
      try {
        checksum = await checksumSessionEntries(record.entries)
      } catch (error) {
        status = 'invalid'
        reason = (error as Error).message
      }
    }

    items.push({
      sessionId,
      agent,
      action: 'migrate',
      status,
      sourceRoot: record.sourceRoot,
      sourceEntries: record.entries,
      targetPath,
      sizeBytes: record.sizeBytes,
      fileCount: record.fileCount,
      expectedChecksum: checksum,
      record,
      reason,
      warnings: record.warnings,
    })
  }

  return storePlan('migrate', agent, items)
}

export async function createRestorePlan(
  agent: SessionAgentId,
  sessionIds: string[],
  root = process.cwd(),
): Promise<SessionPlanResult> {
  if (sessionIds.length === 0) throw new AppError('VALIDATION_ERROR', 'At least one session ID is required.')
  const [scan, config] = await Promise.all([scanSessions(agent, root), loadConfig(root)])
  const restoreRoot = config.sessions.agents[agent].root
  const items: SessionPlanItem[] = []

  for (const sessionId of uniqueIds(sessionIds)) {
    const record = scan.archiveRecords.find((candidate) => candidate.id === sessionId)
    if (!record) throw new AppError('SESSION_NOT_FOUND', `Archived session not found in ${agent}: ${sessionId}`)
    let status: SessionPlanItemStatus = 'ready'
    let reason: string | undefined
    let manifest

    try {
      manifest = await findManifestForRecord(record)
    } catch (error) {
      status = 'invalid'
      reason = (error as Error).message
    }

    const restoreEntries = manifest
      ? manifest.entries.map((entry) => ({
          absolutePath: path.resolve(restoreRoot, entry.originalRelativePath.split('/').join(path.sep)),
          relativePath: entry.originalRelativePath,
          type: entry.type,
        }))
      : []

    if (manifest) {
      try {
        await assertSessionEntriesSafe(agent, restoreRoot, restoreEntries)
        if (await anyPathExists(restoreEntries.map((entry) => entry.absolutePath))) {
          status = 'conflict'
          reason = 'Agent 原目录已经存在同 ID 会话，首版拒绝覆盖。'
        } else {
          const checksum = await checksumSessionEntries(record.entries).catch(() => undefined)
          if (!checksum || checksum !== manifest.checksum) {
            status = 'invalid'
            reason = '归档 payload 与 manifest checksum 不一致。'
          }
        }
      } catch (error) {
        status = 'invalid'
        reason = (error as Error).message
      }
    }

    items.push({
      sessionId,
      agent,
      action: 'restore',
      status,
      sourceRoot: record.sourceRoot,
      sourceEntries: record.entries,
      targetPath: restoreRoot,
      sizeBytes: record.sizeBytes,
      fileCount: record.fileCount,
      expectedChecksum: manifest?.checksum,
      record,
      manifest,
      reason,
      warnings: record.warnings,
    })
  }

  return storePlan('restore', agent, items)
}

export function getSessionPlan(planId: string): SessionOperationPlan {
  const stored = plans.get(planId)
  if (!stored || stored.expiresAt < Date.now()) {
    plans.delete(planId)
    throw new AppError('PLAN_NOT_FOUND', `Session operation plan not found or expired: ${planId}`)
  }
  if (stored.plan.executedAt) {
    throw new AppError('PLAN_ALREADY_EXECUTED', `Session operation plan was already executed: ${planId}`)
  }
  return stored.plan
}

export function markSessionPlanExecuted(planId: string): void {
  const stored = plans.get(planId)
  if (stored) stored.plan.executedAt = new Date().toISOString()
}

function storePlan(
  action: SessionOperationPlan['action'],
  agent: SessionAgentId,
  items: SessionPlanItem[],
): SessionPlanResult {
  const plan: SessionOperationPlan = {
    planId: `spl_${randomUUID()}`,
    action,
    agent,
    createdAt: new Date().toISOString(),
    items,
  }
  plans.set(plan.planId, { plan, expiresAt: Date.now() + PLAN_TTL_MS })
  return {
    plan,
    summary: {
      ready: items.filter((item) => item.status === 'ready').length,
      conflict: items.filter((item) => item.status === 'conflict').length,
      busy: items.filter((item) => item.status === 'busy').length,
      invalid: items.filter((item) => item.status === 'invalid').length,
    },
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

async function anyPathExists(paths: string[]): Promise<boolean> {
  return (await Promise.all(paths.map((target) => pathExists(target)))).some(Boolean)
}
