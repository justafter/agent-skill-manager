import { randomUUID } from 'node:crypto'
import { cp, rename, rm, statfs } from 'node:fs/promises'
import path from 'node:path'
import type {
  ArchiveManifest,
  SessionApplyItemResult,
  SessionApplyResult,
  SessionEntry,
  SessionOperationItemLog,
  SessionOperationLog,
  SessionPlanItem,
} from './types.js'
import type { ActivityProbeOptions } from './activity-probe.js'
import { getSessionPlan, markSessionPlanExecuted } from './plan.js'
import { assertEntriesIdle } from './activity-probe.js'
import { createOperationLog, updateOperationItem } from './operation-journal.js'
import { assertArchivePathSafe, assertSessionEntriesSafe } from './path-guard.js'
import { checksumSessionEntries, fromPortableRelative, snapshotSessionEntries } from './utils.js'
import { writeArchiveManifest } from './manifest.js'
import { getSessionAdapter } from './adapters/registry.js'
import { loadConfig } from '../core/config.js'
import { ensureDir, pathExists } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'

export interface ApplySessionPlanOptions extends ActivityProbeOptions {}

export async function applySessionPlan(
  planId: string,
  root = process.cwd(),
  options: ApplySessionPlanOptions = {},
): Promise<SessionApplyResult> {
  const plan = getSessionPlan(planId)
  const config = await loadConfig(root)
  const archiveDir = config.sessions.archiveDir
  if (!archiveDir) throw new AppError('SESSION_ARCHIVE_NOT_CONFIGURED', 'Session archive directory is not configured.')

  const readyItems = plan.items.filter((item) => item.status === 'ready')
  if (readyItems.length === 0) {
    throw new AppError('NO_APPLICABLE_ITEMS', 'The session plan has no applicable items.')
  }

  await ensureDir(archiveDir)
  const operationId = `sop_${randomUUID()}`
  const log = await createOperationLog(archiveDir, operationId, planId, plan.action, plan.agent, plan.items)
  const results: SessionApplyItemResult[] = []

  for (const item of plan.items) {
    if (item.status !== 'ready') {
      results.push({
        sessionId: item.sessionId,
        state: 'failed',
        error: { code: `SESSION_${item.status.toUpperCase()}`, message: item.reason ?? item.status },
      })
      continue
    }

    const result =
      plan.action === 'migrate'
        ? await migrateItem(item, archiveDir, operationId, log, options)
        : await restoreItem(item, archiveDir, operationId, log)
    results.push(result)
  }

  markSessionPlanExecuted(planId)
  return { planId, operationId, action: plan.action, items: results }
}

async function migrateItem(
  item: SessionPlanItem,
  archiveDir: string,
  operationId: string,
  log: SessionOperationLog,
  options: ApplySessionPlanOptions,
): Promise<SessionApplyItemResult> {
  const stagingBundle = path.join(
    archiveDir,
    '.agent-skill-manager',
    'staging',
    operationId,
    item.sessionId,
  )
  let committed = false

  try {
    await assertSessionEntriesSafe(item.agent, item.sourceRoot, item.sourceEntries)
    await assertArchivePathSafe(archiveDir, stagingBundle)
    await assertArchivePathSafe(archiveDir, item.targetPath)
    if (await pathExists(item.targetPath)) {
      throw new AppError('ARCHIVE_CONFLICT', `Archive target already exists: ${item.targetPath}`)
    }
    await assertEnoughSpace(archiveDir, item.sizeBytes)
    await assertEntriesIdle(item.sourceEntries, options)
    await assertSourceMatchesPlan(item)

    await updateOperationItem(archiveDir, log, item.sessionId, 'copying')
    const payloadRoot = path.join(stagingBundle, 'payload')
    await ensureDir(payloadRoot)
    const stagingEntries: SessionEntry[] = []
    for (const entry of item.sourceEntries) {
      const target = path.join(payloadRoot, fromPortableRelative(entry.relativePath))
      await copyEntry(entry.absolutePath, target, entry.type)
      stagingEntries.push({ ...entry, absolutePath: target })
    }

    const [stagingSnapshot, stagingChecksum, sourceSnapshotAfter, sourceChecksumAfter] = await Promise.all([
      snapshotSessionEntries(stagingEntries),
      checksumSessionEntries(stagingEntries),
      snapshotSessionEntries(item.sourceEntries),
      checksumSessionEntries(item.sourceEntries),
    ])
    if (
      stagingSnapshot.fileCount !== item.fileCount ||
      stagingSnapshot.sizeBytes !== item.sizeBytes ||
      stagingChecksum !== item.expectedChecksum ||
      sourceSnapshotAfter.fileCount !== item.fileCount ||
      sourceSnapshotAfter.sizeBytes !== item.sizeBytes ||
      sourceChecksumAfter !== item.expectedChecksum
    ) {
      throw new AppError('SOURCE_CHANGED', `Session changed while it was being copied: ${item.sessionId}`)
    }

    const now = new Date().toISOString()
    const manifest: ArchiveManifest = {
      schemaVersion: 1,
      archiveId: item.sessionId,
      agent: item.agent,
      sessionId: item.sessionId,
      kind: item.record.kind,
      title: item.record.title,
      workspacePath: item.record.workspacePath,
      originalRoot: item.sourceRoot,
      originalPath: item.sourceEntries[0].absolutePath,
      entries: item.sourceEntries.map((entry) => ({
        originalRelativePath: entry.relativePath,
        payloadRelativePath: entry.relativePath,
        type: entry.type,
      })),
      fileCount: item.fileCount,
      sizeBytes: item.sizeBytes,
      checksum: stagingChecksum,
      createdAt: item.record.createdAt,
      updatedAt: item.record.updatedAt,
      archivedAt: now,
      adapterVersion: getSessionAdapter(item.agent).version,
    }
    await writeArchiveManifest(stagingBundle, manifest)
    await updateOperationItem(archiveDir, log, item.sessionId, 'verified')

    await ensureDir(path.dirname(item.targetPath))
    await rename(stagingBundle, item.targetPath)
    committed = true
    await updateOperationItem(archiveDir, log, item.sessionId, 'committed')

    for (const entry of item.sourceEntries) {
      await rm(entry.absolutePath, { recursive: entry.type === 'directory', force: false })
    }
    await updateOperationItem(archiveDir, log, item.sessionId, 'completed')
    return { sessionId: item.sessionId, state: 'completed' }
  } catch (error) {
    const info = toErrorInfo(error)
    if (!committed) {
      await rm(stagingBundle, { recursive: true, force: true }).catch(() => {})
      await updateOperationItem(archiveDir, log, item.sessionId, 'failed', info)
      return { sessionId: item.sessionId, state: 'failed', error: info }
    }
    await updateOperationItem(archiveDir, log, item.sessionId, 'cleanupPending', info)
    return { sessionId: item.sessionId, state: 'cleanupPending', error: info }
  }
}

async function restoreItem(
  item: SessionPlanItem,
  archiveDir: string,
  operationId: string,
  log: SessionOperationLog,
): Promise<SessionApplyItemResult> {
  const manifest = item.manifest
  if (!manifest || !item.record.archiveBundlePath) {
    const error = { code: 'INVALID_MANIFEST', message: 'Archive manifest is missing.' }
    await updateOperationItem(archiveDir, log, item.sessionId, 'failed', error)
    return { sessionId: item.sessionId, state: 'failed', error }
  }

  const restoreRoot = item.targetPath
  const finalEntries: SessionEntry[] = manifest.entries.map((entry) => ({
    absolutePath: path.resolve(restoreRoot, fromPortableRelative(entry.originalRelativePath)),
    relativePath: entry.originalRelativePath,
    type: entry.type,
  }))
  const tempEntries: SessionEntry[] = finalEntries.map((entry) => ({
    ...entry,
    absolutePath: `${entry.absolutePath}.asm-restore-${operationId}`,
  }))
  let commitStarted = false

  try {
    await ensureDir(restoreRoot)
    await assertSessionEntriesSafe(item.agent, restoreRoot, finalEntries)
    await assertArchivePathSafe(archiveDir, item.record.archiveBundlePath)
    if ((await Promise.all(finalEntries.map((entry) => pathExists(entry.absolutePath)))).some(Boolean)) {
      throw new AppError('RESTORE_CONFLICT', `Restore target already exists for ${item.sessionId}`)
    }
    if ((await Promise.all(tempEntries.map((entry) => pathExists(entry.absolutePath)))).some(Boolean)) {
      throw new AppError('RESTORE_STAGING_CONFLICT', `Restore staging path already exists for ${item.sessionId}`)
    }
    await assertEnoughSpace(restoreRoot, item.sizeBytes)

    const archiveChecksum = await checksumSessionEntries(item.sourceEntries)
    if (archiveChecksum !== manifest.checksum) {
      throw new AppError('INTEGRITY_CHECK_FAILED', `Archive payload checksum failed for ${item.sessionId}`)
    }

    await updateOperationItem(archiveDir, log, item.sessionId, 'copying')
    for (let index = 0; index < item.sourceEntries.length; index++) {
      const source = item.sourceEntries[index]
      const target = tempEntries[index]
      await copyEntry(source.absolutePath, target.absolutePath, target.type)
    }

    const [tempSnapshot, tempChecksum] = await Promise.all([
      snapshotSessionEntries(tempEntries),
      checksumSessionEntries(tempEntries),
    ])
    if (
      tempSnapshot.fileCount !== manifest.fileCount ||
      tempSnapshot.sizeBytes !== manifest.sizeBytes ||
      tempChecksum !== manifest.checksum
    ) {
      throw new AppError('INTEGRITY_CHECK_FAILED', `Restored staging payload checksum failed for ${item.sessionId}`)
    }
    await updateOperationItem(archiveDir, log, item.sessionId, 'verified')

    commitStarted = true
    await updateOperationItem(archiveDir, log, item.sessionId, 'committed')
    for (let index = 0; index < tempEntries.length; index++) {
      await ensureDir(path.dirname(finalEntries[index].absolutePath))
      await rename(tempEntries[index].absolutePath, finalEntries[index].absolutePath)
    }

    const finalChecksum = await checksumSessionEntries(finalEntries)
    if (finalChecksum !== manifest.checksum) {
      throw new AppError('INTEGRITY_CHECK_FAILED', `Final restored payload checksum failed for ${item.sessionId}`)
    }
    await rm(item.record.archiveBundlePath, { recursive: true, force: false })
    await updateOperationItem(archiveDir, log, item.sessionId, 'completed')
    return { sessionId: item.sessionId, state: 'completed' }
  } catch (error) {
    const info = toErrorInfo(error)
    if (!commitStarted) {
      await Promise.all(tempEntries.map((entry) => rm(entry.absolutePath, { recursive: true, force: true }).catch(() => {})))
      await updateOperationItem(archiveDir, log, item.sessionId, 'failed', info)
      return { sessionId: item.sessionId, state: 'failed', error: info }
    }
    await updateOperationItem(archiveDir, log, item.sessionId, 'cleanupPending', info)
    return { sessionId: item.sessionId, state: 'cleanupPending', error: info }
  }
}

async function assertSourceMatchesPlan(item: SessionPlanItem): Promise<void> {
  const [snapshot, checksum] = await Promise.all([
    snapshotSessionEntries(item.sourceEntries),
    checksumSessionEntries(item.sourceEntries),
  ])
  if (
    snapshot.fileCount !== item.fileCount ||
    snapshot.sizeBytes !== item.sizeBytes ||
    !item.expectedChecksum ||
    checksum !== item.expectedChecksum
  ) {
    throw new AppError('SOURCE_CHANGED', `Session no longer matches the confirmed plan: ${item.sessionId}`)
  }
}

async function copyEntry(source: string, target: string, type: SessionEntry['type']): Promise<void> {
  await ensureDir(path.dirname(target))
  await cp(source, target, {
    recursive: type === 'directory',
    force: false,
    errorOnExist: true,
    preserveTimestamps: true,
  })
}

async function assertEnoughSpace(targetRoot: string, payloadBytes: number): Promise<void> {
  await ensureDir(targetRoot)
  const info = await statfs(targetRoot)
  const availableBytes = Number(info.bavail) * Number(info.bsize)
  const safetyBytes = Math.max(64 * 1024 * 1024, Math.ceil(payloadBytes * 0.05))
  const requiredBytes = payloadBytes + safetyBytes
  if (availableBytes < requiredBytes) {
    throw new AppError('INSUFFICIENT_SPACE', 'Not enough free space for the session operation.', {
      targetRoot,
      availableBytes,
      requiredBytes,
    })
  }
}

function toErrorInfo(error: unknown): NonNullable<SessionOperationItemLog['error']> {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  return { code: 'SESSION_OPERATION_FAILED', message: (error as Error).message }
}
