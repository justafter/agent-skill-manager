import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BackupIndex, BackupItem } from '../types/backup.js'
import type { AgentId, TargetKey } from '../types/adapter.js'
import { atomicWriteJson, ensureDir, pathExists } from '../utils/fs.js'
import { loadConfig } from '../core/config.js'
import { copyDirectory } from './copy.js'
import { AppError } from '../utils/errors.js'

export async function backupBeforeSync(
  root: string,
  backupDir: string,
  targetAgent: AgentId,
  skillName: string,
  reason: string,
): Promise<string> {
  try {
    const config = await loadConfig(root)
    const agentConfig = config.targets[targetAgent]
    if (!agentConfig || !agentConfig.userSkillPath) {
      throw new Error(`Target agent "${targetAgent}" userSkillPath is not configured`)
    }

    const targetSkillPath = path.join(agentConfig.userSkillPath, skillName)
    if (!(await pathExists(targetSkillPath))) {
      throw new Error(`Target skill path to backup does not exist: ${targetSkillPath}`)
    }

    const timestamp = Date.now()
    const uuid8 = randomUUID().slice(0, 8)
    const backupId = `bk_${timestamp}_${uuid8}`
    const destDir = path.resolve(root, backupDir, backupId)
    await ensureDir(destDir)

    const items: BackupItem[] = []

    // 1. Backup registry snapshot if exists
    const registryPath = path.join(root, 'library', 'registry.json')
    if (await pathExists(registryPath)) {
      const backupRegistryPath = path.join(destDir, 'registry-snapshot.json')
      const raw = await readFile(registryPath, 'utf8')
      await writeFile(backupRegistryPath, raw)
      items.push({
        type: 'registry',
        originalPath: registryPath,
        backupPath: backupRegistryPath,
      })
    }

    // 2. Backup target skill directory
    const backupSkillPath = path.join(destDir, 'user', targetAgent, skillName)
    await ensureDir(path.dirname(backupSkillPath))
    await copyDirectory(targetSkillPath, backupSkillPath)

    const targetKey: TargetKey = `${targetAgent}:user`
    items.push({
      type: 'skill',
      target: targetKey,
      skillName,
      originalPath: targetSkillPath,
      backupPath: backupSkillPath,
      targetType: 'user',
      targetAgent,
      targetSkillPath,
    })

    const index: BackupIndex = {
      backupId,
      createdAt: new Date().toISOString(),
      reason,
      items,
    }

    await atomicWriteJson(path.join(destDir, 'index.json'), index)
    return backupId
  } catch (error) {
    throw new AppError('BACKUP_FAILED', `Sync backup failed: ${(error as Error).message}`, { originalError: error })
  }
}
