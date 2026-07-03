import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { BackupIndex, BackupItem } from '../types/backup.js'
import { atomicWriteJson, ensureDir } from '../utils/fs.js'

export async function createBackupIndex(root: string, reason: string, items: BackupItem[]): Promise<BackupIndex> {
  const backupId = `bk_${randomUUID()}`
  const index: BackupIndex = {
    backupId,
    createdAt: new Date().toISOString(),
    reason,
    items
  }

  const dir = path.join(root, backupId)
  await ensureDir(dir)
  await atomicWriteJson(path.join(dir, 'index.json'), index)
  return index
}
