import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BackupIndex, BackupItem } from '../types/backup.js'
import { atomicWriteJson, ensureDir, pathExists } from '../utils/fs.js'
import { copyDirectory } from '../sync/copy.js'

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

export async function backupSkillAndRegistry(
  root: string,
  backupDir: string,
  skillName: string,
  reason: string
): Promise<BackupIndex> {
  const backupId = `bk_${Date.now()}_${randomUUID().slice(0, 8)}`
  const destDir = path.join(backupDir, backupId)
  await ensureDir(destDir)

  const items: BackupItem[] = []

  // 1. Backup registry.json if exists
  const registryPath = path.join(root, 'library', 'registry.json')
  if (await pathExists(registryPath)) {
    const backupRegistryPath = path.join(destDir, 'registry-snapshot.json')
    const raw = await readFile(registryPath, 'utf8')
    await writeFile(backupRegistryPath, raw)
    items.push({
      type: 'registry',
      originalPath: registryPath,
      backupPath: backupRegistryPath
    })
  }

  // 2. Backup old skill dir if exists
  const oldSkillDir = path.join(root, 'library', 'skills', skillName)
  if (await pathExists(oldSkillDir)) {
    const backupSkillDir = path.join(destDir, 'library', 'skills', skillName)
    await ensureDir(path.dirname(backupSkillDir))
    await copyDirectory(oldSkillDir, backupSkillDir)
    items.push({
      type: 'skill',
      skillName,
      originalPath: oldSkillDir,
      backupPath: backupSkillDir
    })
  }

  const index: BackupIndex = {
    backupId,
    createdAt: new Date().toISOString(),
    reason,
    items
  }

  await atomicWriteJson(path.join(destDir, 'index.json'), index)
  return index
}
