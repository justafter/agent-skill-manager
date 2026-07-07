import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { PlanId, PlanItem, PlanResult, ApplyResult } from '../types/plan.js'
import type { TargetKey, AgentId } from '../types/adapter.js'
import { loadConfig } from '../core/config.js'
import { loadRegistry, saveRegistry } from '../core/registry.js'
import { createAdapters } from '../adapters/registry.js'
import { identifySkillState } from '../adapters/scan.js'
import { readDeployTag, writeDeployTag } from './deploy-tag.js'
import { backupBeforeSync } from './backup-user.js'
import { createPlan, markPlanExecuted } from '../core/plan.js'
import { getPlan } from '../core/state.js'
import { assertSafeWritePath } from '../projects/guard.js'
import { copyDirectory } from './copy.js'
import { checksumDirectory } from '../utils/hash.js'
import { pathExists, ensureDir } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'

async function replaceDirectoryFromSource(sourceDir: string, targetDir: string): Promise<void> {
  const tempDir = path.join(
    path.dirname(targetDir),
    `.${path.basename(targetDir)}.sync-${process.pid}-${Date.now()}`
  )
  await rm(tempDir, { recursive: true, force: true })
  try {
    await ensureDir(path.dirname(targetDir))
    await copyDirectory(sourceDir, tempDir)
    if (await pathExists(targetDir)) {
      await rm(targetDir, { recursive: true, force: true })
    }
    await import('node:fs/promises').then(({ rename }) => rename(tempDir, targetDir))
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

async function syncPulledSkillToDevelopmentPath(
  backupDir: string,
  skillName: string,
  sourceDir: string,
  developmentDir: string,
  localLibraryDir: string,
  planId: PlanId
): Promise<void> {
  if (path.resolve(developmentDir) === path.resolve(localLibraryDir)) {
    return
  }

  if (path.basename(path.resolve(developmentDir)) !== skillName) {
    throw new AppError(
      'INVALID_DEVELOPMENT_PATH',
      `Development path basename must match skill name: ${developmentDir}`,
      { skillName, developmentDir }
    )
  }

  const { backupDevelopmentSkill } = await import('../backup/create.js')
  await backupDevelopmentSkill(
    backupDir,
    skillName,
    developmentDir,
    `Development path backup before pull apply ${planId}`
  )

  await replaceDirectoryFromSource(sourceDir, developmentDir)

  const { parseSkillDir } = await import('../validation/skill.js')
  await parseSkillDir(developmentDir)
}

export async function planSync(
  skillName: string,
  targets?: TargetKey[],
  options: { allowManagedModify?: boolean; allowConflictOverwrite?: boolean; from?: TargetKey } = {},
  root = process.cwd()
): Promise<PlanResult> {
  const registry = await loadRegistry(root)
  const skill = registry.skills[skillName]
  
  if (!options.from && !skill) {
    throw new AppError('SKILL_NOT_FOUND', `Skill "${skillName}" is not registered.`)
  }

  const config = await loadConfig(root)
  const adapters = createAdapters(config)

  let sourceDir: string
  let sourceChecksum: string
  let sourceBytes = 0

  const { readdir, stat } = await import('node:fs/promises')
  const getDirectorySize = async (dir: string): Promise<number> => {
    let size = 0
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        const absolutePath = path.join(entry.path ?? dir, entry.name)
        const info = await stat(absolutePath).catch(() => null)
        if (info) size += info.size
      }
    }
    return size
  }

  if (options.from) {
    const parts = options.from.split(':')
    if (parts.length !== 2) {
      throw new AppError('INVALID_FROM_KEY', `Invalid from key: ${options.from}`)
    }
    const [fromAgent, fromScope] = parts as [AgentId, string]
    if (fromAgent === 'gemini') {
      throw new AppError('TARGET_REFUSED', `Sync from Gemini/Antigravity is not supported in D3b.`)
    }
    if (!['claude', 'codex'].includes(fromAgent) || fromScope !== 'user') {
      throw new AppError('INVALID_FROM_KEY', `From target "${options.from}" is not supported.`)
    }

    const fromAdapter = adapters[fromAgent]
    const fromUserPath = fromAdapter.getTargetPaths().userSkillPath
    if (!fromUserPath) {
      throw new AppError('FROM_NOT_CONFIGURED', `From target "${options.from}" path is not configured.`)
    }

    sourceDir = path.join(fromUserPath, skillName)
    if (!(await pathExists(sourceDir))) {
      throw new AppError('SKILL_SOURCE_MISSING', `Source files for skill "${skillName}" are missing at ${sourceDir}.`)
    }

    const fromSkills = await fromAdapter.scanUserSkills()
    const fromInfo = fromSkills[skillName]
    if (!fromInfo) {
      throw new AppError('SKILL_SOURCE_MISSING', `Skill "${skillName}" not found on target "${options.from}".`)
    }
    sourceChecksum = fromInfo.checksum
    sourceBytes = await getDirectorySize(sourceDir)
  } else {
    sourceDir = path.join(root, 'library', 'skills', skillName)
    if (!(await pathExists(sourceDir))) {
      throw new AppError(
        'SKILL_SOURCE_MISSING',
        `Canonical source files for skill "${skillName}" are missing at ${sourceDir}.`
      )
    }
    sourceChecksum = skill.checksum
    sourceBytes = await getDirectorySize(sourceDir)
  }

  let selectedTargets: (TargetKey | 'local')[] = targets || []
  if (selectedTargets.length === 0) {
    if (options.from) {
      selectedTargets = ['local']
    } else {
      for (const [key, target] of Object.entries(config.targets)) {
        if (target.enabled) {
          selectedTargets.push(`${key as AgentId}:user`)
        }
      }
    }
  }

  if (options.from && !selectedTargets.includes('local')) {
    selectedTargets = ['local', ...selectedTargets]
  }

  // Validate targets
  for (const targetKey of selectedTargets) {
    if (targetKey === 'local') {
      continue
    }
    const parts = targetKey.split(':')
    if (parts.length !== 2) {
      throw new AppError('INVALID_TARGET_KEY', `Target key "${targetKey}" is invalid. Must be agent:scope format.`)
    }
    const [agent, scope] = parts as [AgentId, string]
    if (agent === 'gemini') {
      throw new AppError('TARGET_REFUSED', `Sync to Gemini/Antigravity is not supported.`)
    }
    if (!['claude', 'codex'].includes(agent)) {
      throw new AppError('INVALID_TARGET_AGENT', `Agent "${agent}" is not supported.`)
    }
    if (scope !== 'user') {
      throw new AppError('UNSUPPORTED_SCOPE', `Scope "${scope}" is not supported in D3b.`)
    }
    if (options.from === targetKey) {
      throw new AppError('SAME_SOURCE_TARGET', `Cannot sync from and to the same target: ${targetKey}`)
    }
  }

  const items: PlanItem[] = []

  for (const targetKey of selectedTargets) {
    if (targetKey === 'local') {
      const localSkillDir = path.join(root, 'library', 'skills', skillName)
      const localExists = await pathExists(localSkillDir)

      if (!localExists) {
        items.push({
          kind: 'create',
          target: localSkillDir,
          bytes: sourceBytes,
          targetKey: 'local' as any,
          targetDir: localSkillDir
        })
      } else {
        const localChecksum = skill?.checksum || await checksumDirectory(localSkillDir)
        if (localChecksum === sourceChecksum) {
          items.push({
            kind: 'skip',
            target: localSkillDir,
            reason: 'identical',
            targetKey: 'local' as any,
            targetDir: localSkillDir
          })
        } else {
          items.push({
            kind: 'modify',
            target: localSkillDir,
            checksumBefore: localChecksum,
            checksumAfter: sourceChecksum,
            targetKey: 'local' as any,
            targetDir: localSkillDir
          })
        }
      }
      continue
    }

    const agent = targetKey.split(':')[0] as AgentId
    const adapter = adapters[agent]
    const userSkillPath = adapter.getTargetPaths().userSkillPath
    if (!userSkillPath) {
      continue
    }

    const targetSkillDir = path.join(userSkillPath, skillName)
    const targetSkills = await adapter.scanUserSkills()
    const targetInfo = targetSkills[skillName]

    const status = identifySkillState(skill, targetInfo)

    if (status === 'identical') {
      items.push({
        kind: 'skip',
        target: targetSkillDir,
        reason: 'identical',
        targetKey,
        targetDir: targetSkillDir
      })
    } else if (status === 'missing') {
      items.push({
        kind: 'create',
        target: targetSkillDir,
        bytes: sourceBytes,
        targetKey,
        targetDir: targetSkillDir
      })
    } else if (status === 'changed') {
      if (options.allowManagedModify || options.allowConflictOverwrite) {
        items.push({
          kind: 'modify',
          target: targetSkillDir,
          checksumBefore: targetInfo.checksum,
          checksumAfter: sourceChecksum,
          targetKey,
          targetDir: targetSkillDir
        })
      } else {
        items.push({
          kind: 'conflict',
          target: targetSkillDir,
          checksumBefore: targetInfo.checksum,
          checksumAfter: sourceChecksum,
          managedBy: 'AgentSkillManager',
          targetKey,
          targetDir: targetSkillDir
        })
      }
    } else {
      if (options.allowConflictOverwrite && targetInfo) {
        items.push({
          kind: 'modify',
          target: targetSkillDir,
          checksumBefore: targetInfo.checksum,
          checksumAfter: sourceChecksum,
          targetKey,
          targetDir: targetSkillDir
        })
      } else {
        items.push({
          kind: 'conflict',
          target: targetSkillDir,
          checksumBefore: targetInfo?.checksum || 'unknown',
          checksumAfter: sourceChecksum,
          targetKey,
          targetDir: targetSkillDir
        })
      }
    }
  }

  return createPlan({
    source: sourceDir,
    items
  })
}

export async function applySyncPlan(
  planId: PlanId,
  options: { allowManagedModify?: boolean; allowConflictOverwrite?: boolean } = {},
  root = process.cwd()
): Promise<ApplyResult> {
  const plan = getPlan(planId)
  if (!plan) {
    throw new AppError('PLAN_NOT_FOUND', `Plan not found or expired: ${planId}`)
  }

  if (plan.executedAt) {
    throw new AppError('PLAN_ALREADY_EXECUTED', `Plan ${planId} has already been executed.`)
  }

  const config = await loadConfig(root)
  const registry = await loadRegistry(root)

  const registrySnapshot = JSON.parse(JSON.stringify(registry))

  const applied: PlanItem[] = []
  const skipped: PlanItem[] = []

  try {
    for (const item of plan.items) {
      if (item.kind === 'skip' || item.kind === 'conflict') {
        skipped.push(item)
        continue
      }

      if (
        item.kind === 'modify' &&
        (item.targetKey as string) !== 'local' &&
        !options.allowManagedModify &&
        !options.allowConflictOverwrite
      ) {
        throw new AppError(
          'INCONSISTENT_OPTIONS',
          `Cannot apply modify item without overwrite permission enabled: ${item.target}`
        )
      }

      const targetDir = item.targetDir || item.target
      const targetKey = item.targetKey
      if (!targetKey) {
        throw new AppError('INVALID_PLAN_ITEM', `Missing targetKey in plan item: ${item.target}`)
      }

      await assertSafeWritePath(targetDir, config)

      const skillName = path.basename(targetDir)

      if ((targetKey as string) === 'local') {
        const { backupSkillAndRegistry } = await import('../backup/create.js')
        if (await pathExists(targetDir)) {
          await backupSkillAndRegistry(root, config.backupDir, skillName, `Reverse pull backup for plan ${planId}`)
        }

        await replaceDirectoryFromSource(plan.source, targetDir)

        const { parseSkillDir } = await import('../validation/skill.js')
        const newMeta = await parseSkillDir(targetDir)

        const existingSkill = registry.skills[skillName]
        const developmentPath = existingSkill?.localPath
        registry.skills[skillName] = {
          ...newMeta,
          localPath: existingSkill?.localPath || targetDir,
          syncedTargets: existingSkill ? existingSkill.syncedTargets : [],
          projectInstalls: existingSkill ? existingSkill.projectInstalls : []
        }

        if (developmentPath) {
          await syncPulledSkillToDevelopmentPath(
            config.backupDir,
            skillName,
            plan.source,
            developmentPath,
            targetDir,
            planId
          )
        }

        const adapters = createAdapters(config)
        let sourceKey: TargetKey | undefined
        for (const [key, adapter] of Object.entries(adapters)) {
          const uPath = adapter.getTargetPaths().userSkillPath
          if (uPath && plan.source.startsWith(uPath)) {
            sourceKey = `${key as AgentId}:user`
            break
          }
        }
        if (sourceKey) {
          const synced = registry.skills[skillName].syncedTargets || []
          if (!synced.includes(sourceKey)) {
            registry.skills[skillName].syncedTargets = [...synced, sourceKey]
          }
        }
      } else {
        const agent = targetKey.split(':')[0] as AgentId

        if (item.kind === 'modify') {
          await backupBeforeSync(root, config.backupDir, agent, skillName, `Sync backup for plan ${planId}`)
        }

        if (await pathExists(targetDir)) {
          await rm(targetDir, { recursive: true, force: true })
        }
        await ensureDir(path.dirname(targetDir))
        await copyDirectory(plan.source, targetDir)

        const sourceHash = registry.skills[skillName]?.checksum || await checksumDirectory(plan.source)
        await writeDeployTag(targetDir, {
          managedBy: 'AgentSkillManager',
          skillName,
          sourcePath: plan.source,
          sourceHash,
          target: targetKey,
          deployedAt: new Date().toISOString()
        })

        if (registry.skills[skillName]) {
          const synced = registry.skills[skillName].syncedTargets || []
          if (!synced.includes(targetKey)) {
            registry.skills[skillName].syncedTargets = [...synced, targetKey]
          }
        }
      }

      applied.push(item)
    }

    await saveRegistry(registry, root)
    markPlanExecuted(planId, applied)

    return {
      planId,
      applied,
      skipped
    }
  } catch (error) {
    try {
      await saveRegistry(registrySnapshot, root)
    } catch {
      // Ignored
    }
    throw error
  }
}
