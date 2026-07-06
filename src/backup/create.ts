import { randomUUID } from 'node:crypto'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { BackupIndex, BackupItem } from '../types/backup.js'
import { atomicWriteJson, ensureDir, pathExists } from '../utils/fs.js'
import { loadConfig } from '../core/config.js'
import { copyDirectory } from '../sync/copy.js'
import { readBackupIndex } from './index.js'
import { AppError } from '../utils/errors.js'

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

export async function createManualBackup(
  root = process.cwd(),
  skillName?: string,
  reason = 'Manual backup'
): Promise<BackupIndex> {
  const config = await loadConfig(root)
  const timestamp = Date.now()
  const uuid8 = randomUUID().slice(0, 8)
  const backupId = `bk_${timestamp}_${uuid8}`
  const destDir = path.resolve(root, config.backupDir, backupId)
  await ensureDir(destDir)

  const items: BackupItem[] = []

  // 1. Registry backup
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

  if (skillName) {
    const skillDir = path.join(root, 'library', 'skills', skillName)
    if (await pathExists(skillDir)) {
      const backupSkillDir = path.join(destDir, 'library', 'skills', skillName)
      await ensureDir(path.dirname(backupSkillDir))
      await copyDirectory(skillDir, backupSkillDir)
      items.push({
        type: 'skill',
        skillName,
        originalPath: skillDir,
        backupPath: backupSkillDir
      })
    } else {
      throw new AppError('SKILL_NOT_FOUND', `Skill "${skillName}" not found in local library.`)
    }
  } else {
    const skillsDir = path.join(root, 'library', 'skills')
    if (await pathExists(skillsDir)) {
      const backupSkillsDir = path.join(destDir, 'library', 'skills')
      await ensureDir(path.dirname(backupSkillsDir))
      await copyDirectory(skillsDir, backupSkillsDir)
      items.push({
        type: 'skill',
        originalPath: skillsDir,
        backupPath: backupSkillsDir
      })
    }
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

export async function listBackups(root = process.cwd()): Promise<BackupIndex[]> {
  const config = await loadConfig(root)
  const backupDir = path.resolve(root, config.backupDir)
  if (!(await pathExists(backupDir))) {
    return []
  }

  const entries = await readdir(backupDir, { withFileTypes: true }).catch(() => [])
  const list: BackupIndex[] = []

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('bk_')) {
      const indexFile = path.join(backupDir, entry.name, 'index.json')
      if (await pathExists(indexFile)) {
        try {
          const index = await readBackupIndex(indexFile)
          list.push(index)
        } catch {
          // Ignore corrupt backups
        }
      }
    }
  }

  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
