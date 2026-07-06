import { rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { BackupIndex } from '../types/backup.js'
import { readBackupIndex } from './index.js'
import { loadConfig } from '../core/config.js'
import { pathExists, ensureDir, atomicWriteFile } from '../utils/fs.js'
import { copyDirectory } from '../sync/copy.js'
import { AppError } from '../utils/errors.js'

export async function restoreBackup(backupId: string, root = process.cwd()): Promise<BackupIndex> {
  const config = await loadConfig(root)
  const backupDir = path.resolve(root, config.backupDir)
  const indexFile = path.join(backupDir, backupId, 'index.json')
  
  if (!(await pathExists(indexFile))) {
    throw new AppError('BACKUP_NOT_FOUND', `Backup index file not found for ID: ${backupId}`)
  }

  const index = await readBackupIndex(indexFile)

  // Restore items in reverse order
  for (const item of [...index.items].reverse()) {
    if (item.type === 'registry') {
      const registryContent = await readFile(item.backupPath, 'utf8')
      await atomicWriteFile(item.originalPath, registryContent)
    } else if (item.type === 'skill') {
      if (await pathExists(item.originalPath)) {
        await rm(item.originalPath, { recursive: true, force: true })
      }
      if (await pathExists(item.backupPath)) {
        await ensureDir(path.dirname(item.originalPath))
        await copyDirectory(item.backupPath, item.originalPath)
      }
    } else if (item.type === 'rule') {
      if (await pathExists(item.backupPath)) {
        const ruleContent = await readFile(item.backupPath, 'utf8')
        await atomicWriteFile(item.originalPath, ruleContent)
      } else {
        await rm(item.originalPath, { force: true })
      }
    }
  }

  return index
}
