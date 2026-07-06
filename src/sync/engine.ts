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

export async function planSync(
  skillName: string,
  targets?: TargetKey[],
  options: { allowManagedModify?: boolean } = {},
  root = process.cwd()
): Promise<PlanResult> {
  const registry = await loadRegistry(root)
  const skill = registry.skills[skillName]
  if (!skill) {
    throw new AppError('SKILL_NOT_FOUND', `Skill "${skillName}" is not registered.`)
  }

  const sourceDir = path.join(root, 'library', 'skills', skillName)
  if (!(await pathExists(sourceDir))) {
    throw new AppError(
      'SKILL_SOURCE_MISSING',
      `Canonical source files for skill "${skillName}" are missing at ${sourceDir}.`
    )
  }

  const config = await loadConfig(root)
  const adapters = createAdapters(config)

  const selectedTargets: TargetKey[] = targets || []
  if (selectedTargets.length === 0) {
    for (const [key, target] of Object.entries(config.targets)) {
      if (target.enabled) {
        selectedTargets.push(`${key as AgentId}:user`)
      }
    }
  }

  // Validate targets
  for (const targetKey of selectedTargets) {
    const parts = targetKey.split(':')
    if (parts.length !== 2) {
      throw new AppError('INVALID_TARGET_KEY', `Target key "${targetKey}" is invalid. Must be agent:scope format.`)
    }
    const [agent, scope] = parts as [AgentId, string]
    if (agent === 'gemini') {
      throw new AppError('TARGET_REFUSED', `Sync to Gemini/Antigravity is not supported in D3a.`)
    }
    if (!['claude', 'codex'].includes(agent)) {
      throw new AppError('INVALID_TARGET_AGENT', `Agent "${agent}" is not supported.`)
    }
    if (scope !== 'user') {
      throw new AppError('UNSUPPORTED_SCOPE', `Scope "${scope}" is not supported in D3a.`)
    }
  }

  const items: PlanItem[] = []

  // Sum directory size
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
  const sourceBytes = await getDirectorySize(sourceDir)

  for (const targetKey of selectedTargets) {
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
      if (options.allowManagedModify) {
        items.push({
          kind: 'modify',
          target: targetSkillDir,
          checksumBefore: targetInfo.checksum,
          checksumAfter: skill.checksum,
          targetKey,
          targetDir: targetSkillDir
        })
      } else {
        items.push({
          kind: 'conflict',
          target: targetSkillDir,
          checksumBefore: targetInfo.checksum,
          checksumAfter: skill.checksum,
          managedBy: 'AgentSkillManager',
          targetKey,
          targetDir: targetSkillDir
        })
      }
    } else {
      items.push({
        kind: 'conflict',
        target: targetSkillDir,
        checksumBefore: targetInfo?.checksum || 'unknown',
        checksumAfter: skill.checksum,
        targetKey,
        targetDir: targetSkillDir
      })
    }
  }

  return createPlan({
    source: sourceDir,
    items
  })
}

export async function applySyncPlan(
  planId: PlanId,
  options: { allowManagedModify?: boolean } = {},
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

      if (item.kind === 'modify' && !options.allowManagedModify) {
        throw new AppError(
          'INCONSISTENT_OPTIONS',
          `Cannot apply modify item without allowManagedModify enabled: ${item.target}`
        )
      }

      const targetDir = item.targetDir || item.target
      const targetKey = item.targetKey
      if (!targetKey) {
        throw new AppError('INVALID_PLAN_ITEM', `Missing targetKey in plan item: ${item.target}`)
      }

      await assertSafeWritePath(targetDir, config)

      const agent = targetKey.split(':')[0] as AgentId

      if (item.kind === 'modify') {
        await backupBeforeSync(root, config.backupDir, agent, path.basename(targetDir), `Sync backup for plan ${planId}`)
      }

      if (await pathExists(targetDir)) {
        await rm(targetDir, { recursive: true, force: true })
      }
      await ensureDir(path.dirname(targetDir))
      await copyDirectory(plan.source, targetDir)

      const skillName = path.basename(targetDir)
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
