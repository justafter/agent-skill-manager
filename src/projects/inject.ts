import { rm, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Project } from '../types/project.js'
import type { SkillMeta } from '../types/skill.js'
import type { PlanId, PlanItem, PlanResult, ApplyResult } from '../types/plan.js'
import type { TargetKey, AgentId } from '../types/adapter.js'
import type { BackupIndex, BackupItem } from '../types/backup.js'
import { createPlan, markPlanExecuted } from '../core/plan.js'
import { getPlan } from '../core/state.js'
import { loadConfig } from '../core/config.js'
import { loadRegistry, saveRegistry } from '../core/registry.js'
import { assertInsideProject, assertSafeWritePath } from './guard.js'
import { pathExists, ensureDir, atomicWriteJson } from '../utils/fs.js'
import { checksumDirectory } from '../utils/hash.js'
import { copyDirectory } from '../sync/copy.js'
import { readDeployTag, writeDeployTag } from '../sync/deploy-tag.js'

export async function planProjectSkillInject(
  project: Project,
  skill: SkillMeta,
  agent: AgentId,
  root = process.cwd(),
): Promise<PlanResult> {
  const config = await loadConfig(root)
  const agentConfig = config.targets[agent]
  if (!agentConfig || !agentConfig.projectSkillPath) {
    throw new Error(`Target agent "${agent}" projectSkillPath is not configured`)
  }

  const targetDir = path.join(project.path, agentConfig.projectSkillPath, skill.name)
  await assertInsideProject(project.path, targetDir)

  // Get size of local canonical skill
  const canonicalDir = path.join(root, 'library', 'skills', skill.name)
  if (!(await pathExists(canonicalDir))) {
    throw new Error(`Canonical source files for skill "${skill.name}" are missing at ${canonicalDir}.`)
  }

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

  const sourceBytes = await getDirectorySize(canonicalDir)
  const targetKey: TargetKey = `${agent}:project`

  const items: PlanItem[] = []
  if (!(await pathExists(targetDir))) {
    items.push({
      kind: 'create',
      target: targetDir,
      bytes: sourceBytes,
      targetKey,
      targetDir,
    })
  } else {
    // If it exists, let's check deploy tag
    const deployTag = await readDeployTag(targetDir).catch(() => null)
    const targetChecksum = await checksumDirectory(targetDir)

    if (targetChecksum === skill.checksum) {
      items.push({
        kind: 'skip',
        target: targetDir,
        reason: 'identical',
        targetKey,
        targetDir,
      })
    } else if (deployTag && deployTag.managedBy === 'AgentSkillManager') {
      items.push({
        kind: 'modify',
        target: targetDir,
        checksumBefore: targetChecksum,
        checksumAfter: skill.checksum,
        targetKey,
        targetDir,
      })
    } else {
      // Not managed -> Conflict
      items.push({
        kind: 'conflict',
        target: targetDir,
        checksumBefore: targetChecksum,
        checksumAfter: skill.checksum,
        targetKey,
        targetDir,
      })
    }
  }

  return createPlan({
    source: canonicalDir,
    items,
  })
}

export async function applyProjectSkillInject(
  planId: PlanId,
  projectId: string,
  options: { allowManagedModify?: boolean } = {},
  root = process.cwd(),
): Promise<ApplyResult> {
  const plan = getPlan(planId)
  if (!plan) {
    throw new Error(`Plan not found or expired: ${planId}`)
  }
  if (plan.executedAt) {
    throw new Error(`Plan ${planId} has already been executed.`)
  }

  const config = await loadConfig(root)
  const project = config.projects.find((p) => p.id === projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" not registered.`)
  }

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
        throw new Error(`Cannot apply modify item without allowManagedModify enabled: ${item.target}`)
      }

      const targetDir = item.targetDir || item.target
      const targetKey = item.targetKey
      if (!targetKey) {
        throw new Error(`Missing targetKey in plan item: ${item.target}`)
      }

      await assertInsideProject(project.path, targetDir)
      await assertSafeWritePath(targetDir, config)

      const skillName = path.basename(targetDir)
      const agent = targetKey.split(':')[0] as AgentId

      // 1. Backup if target path exists
      if (await pathExists(targetDir)) {
        await backupProjectSkill(
          root,
          config.backupDir,
          project,
          agent,
          skillName,
          `Sync inject backup for plan ${planId}`,
        )
      }

      // 2. Perform write
      if (await pathExists(targetDir)) {
        await rm(targetDir, { recursive: true, force: true })
      }
      await ensureDir(path.dirname(targetDir))
      await copyDirectory(plan.source, targetDir)

      // 3. Write DeployTag
      const sourceHash = registry.skills[skillName]?.checksum || (await checksumDirectory(plan.source))
      await writeDeployTag(targetDir, {
        managedBy: 'AgentSkillManager',
        skillName,
        sourcePath: plan.source,
        sourceHash,
        target: targetKey,
        projectId,
        deployedAt: new Date().toISOString(),
      })

      // 4. Update projectInstalls in registry
      if (registry.skills[skillName]) {
        const installs = registry.skills[skillName].projectInstalls || []
        const existingIdx = installs.findIndex((inst) => inst.projectId === projectId && inst.target === targetKey)
        const newInstall = {
          projectId,
          target: targetKey,
          checksum: sourceHash as `sha256:${string}`,
          deployedAt: new Date().toISOString(),
        }
        if (existingIdx >= 0) {
          installs[existingIdx] = newInstall
        } else {
          installs.push(newInstall)
        }
        registry.skills[skillName].projectInstalls = installs
      }

      applied.push(item)
    }

    await saveRegistry(registry, root)
    markPlanExecuted(planId, applied)

    return {
      planId,
      applied,
      skipped,
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

async function backupProjectSkill(
  root: string,
  backupDir: string,
  project: Project,
  agent: AgentId,
  skillName: string,
  reason: string,
): Promise<string> {
  const config = await loadConfig(root)
  const agentConfig = config.targets[agent]
  if (!agentConfig || !agentConfig.projectSkillPath) {
    throw new Error(`Target agent "${agent}" projectSkillPath is not configured`)
  }

  const targetSkillPath = path.join(project.path, agentConfig.projectSkillPath, skillName)
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
  const backupSkillPath = path.join(destDir, 'project', project.id, agent, skillName)
  await ensureDir(path.dirname(backupSkillPath))
  await copyDirectory(targetSkillPath, backupSkillPath)

  const targetKey: TargetKey = `${agent}:project`
  items.push({
    type: 'skill',
    target: targetKey,
    projectId: project.id,
    skillName,
    originalPath: targetSkillPath,
    backupPath: backupSkillPath,
    targetType: 'project',
    targetAgent: agent,
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
}
