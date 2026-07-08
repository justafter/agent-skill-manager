import { rm, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '../core/config.js'
import { AppError } from '../utils/errors.js'
import { pathExists } from '../utils/fs.js'
import type { BackupIndex } from '../types/backup.js'

const BACKUP_ID_PATTERN = /^bk_[A-Za-z0-9_-]+$/

export interface DeleteBackupResult {
  backupId: string
  removedItems: number
  removedBytes: number
}

/**
 * Compute the total bytes of a backup on disk by summing the size of each
 * `item.backupPath`. Skill entries are directories; registry/rule entries are
 * regular files. Missing entries are skipped (best-effort accounting).
 */
async function measureBackupBytes(index: BackupIndex): Promise<number> {
  let total = 0
  for (const item of index.items) {
    if (!(await pathExists(item.backupPath))) continue
    try {
      const s = await stat(item.backupPath)
      if (s.isDirectory()) {
        // Best-effort: walk recursively. We deliberately do not pull in a tree
        // utility; a recursive manual sum is enough for an audit estimate and
        // keeps the implementation local.
        total += await dirSize(item.backupPath)
      } else {
        total += s.size
      }
    } catch {
      // ignore
    }
  }
  return total
}

async function dirSize(dir: string): Promise<number> {
  const { readdir } = await import('node:fs/promises')
  let total = 0
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      total += await dirSize(p)
    } else if (entry.isFile()) {
      try {
        const s = await stat(p)
        total += s.size
      } catch {
        // ignore
      }
    }
  }
  return total
}

/**
 * Delete a single backup directory and its index.json from disk.
 *
 *  - Rejects malformed / out-of-bounds `backupId`.
 *  - Verifies `index.json` parses before touching disk.
 *  - Refuses to delete anything outside `<root>/<config.backupDir>`.
 *
 * Does NOT modify `library/` or `config.json`; only the backup archive itself.
 */
export async function deleteBackup(
  backupId: string,
  root: string = process.cwd(),
): Promise<DeleteBackupResult> {
  if (!backupId || typeof backupId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Missing backupId parameter')
  }
  if (!BACKUP_ID_PATTERN.test(backupId)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Invalid backupId format: "${backupId}". Expected pattern: ${BACKUP_ID_PATTERN.source}`,
    )
  }
  if (backupId.includes('..') || backupId.includes('/') || backupId.includes('\\')) {
    // Defence-in-depth: pattern already rejects slashes/dots, but reject again
    // so any future regex loosening cannot accidentally accept traversal.
    throw new AppError('PATH_OUT_OF_BOUNDS', `Refusing to operate on unsafe backupId: "${backupId}"`)
  }

  const config = await loadConfig(root)
  const backupRoot = path.resolve(root, config.backupDir)
  const targetDir = path.resolve(backupRoot, backupId)

  // Path safety: target must remain inside backupRoot.
  const rel = path.relative(backupRoot, targetDir)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new AppError(
      'PATH_OUT_OF_BOUNDS',
      `Refusing to delete outside of backupDir: ${targetDir}`,
    )
  }

  const indexFile = path.join(targetDir, 'index.json')
  if (!(await pathExists(indexFile))) {
    throw new AppError('BACKUP_NOT_FOUND', `Backup index file not found for ID: ${backupId}`)
  }

  // Parse-validate BEFORE deleting anything.
  let index: BackupIndex
  try {
    index = JSON.parse(await readFile(indexFile, 'utf8')) as BackupIndex
  } catch (err) {
    throw new AppError(
      'BACKUP_CORRUPT',
      `Backup index file is corrupt for ID "${backupId}": ${(err as Error).message}`,
    )
  }

  const removedBytes = await measureBackupBytes(index)
  const removedItems = index.items?.length ?? 0

  await rm(targetDir, { recursive: true, force: true })

  return {
    backupId,
    removedItems,
    removedBytes,
  }
}