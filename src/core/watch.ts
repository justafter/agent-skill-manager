import chokidar from 'chokidar'
import path from 'node:path'
import { appendFile } from 'node:fs/promises'
import { loadRegistry } from './registry.js'
import { importSkill } from './import.js'
import { planSync, applySyncPlan } from '../sync/engine.js'
import { planProjectSkillInject, applyProjectSkillInject } from '../projects/inject.js'
import { loadConfig } from './config.js'
import { pathExists, ensureDir } from '../utils/fs.js'
import { writePidFile, deletePidFile } from '../utils/pidfile.js'
import { expandUserProfile } from '../utils/paths.js'

// Map of skillName -> FSWatcher
const activeWatchers = new Map<string, chokidar.FSWatcher>()
// Map of skillName -> last sync status for UI
const watchStatus = new Map<
  string,
  { lastSyncedAt: string; status: 'watching' | 'success' | 'error'; error?: string }
>()

export function getWatchStatus(skillName: string) {
  return watchStatus.get(skillName) || null
}

export function getAllWatchStatuses() {
  return Array.from(watchStatus.entries()).map(([skillName, status]) => ({
    skillName,
    ...status,
  }))
}

async function logWatchError(skillName: string, error: string): Promise<void> {
  try {
    const logFile = expandUserProfile('%USERPROFILE%/.skill-manager/logs/watch-error.log')
    await ensureDir(path.dirname(logFile))
    const entry = `${new Date().toISOString()} [${skillName}] ERROR: ${error}\n`
    await appendFile(logFile, entry, 'utf8')
  } catch (err) {
    console.error('Failed to write to watch error log:', err)
  }
}

export async function startWatch(skillName: string, targetList?: string[], root = process.cwd()): Promise<void> {
  if (activeWatchers.has(skillName)) {
    return // Already watching
  }

  const registry = await loadRegistry(root)
  const skill = registry.skills[skillName]
  if (!skill) {
    throw new Error(`Skill "${skillName}" is not registered.`)
  }

  const devDir = skill.localPath
  if (!devDir) {
    throw new Error(`Skill "${skillName}" does not have a local development path.`)
  }

  if (!(await pathExists(devDir))) {
    throw new Error(`Skill local path does not exist: ${devDir}`)
  }

  // Determine watch targets
  let resolvedTargets: string[] = targetList || []
  if (resolvedTargets.length === 0) {
    resolvedTargets = [...(skill.syncedTargets || [])]
    for (const inst of skill.projectInstalls || []) {
      const agentPrefix = inst.target.split(':')[0]
      resolvedTargets.push(`${inst.projectId}:${agentPrefix}`)
    }
  }

  if (resolvedTargets.length === 0) {
    throw new Error(`No sync targets configured or active for skill "${skillName}". Please specify a target.`)
  }

  watchStatus.set(skillName, {
    lastSyncedAt: new Date().toISOString(),
    status: 'watching',
  })

  // Write PID file
  await writePidFile(`watch-skill-${skillName}`, process.pid)

  // Setup chokidar watcher
  const watcher = chokidar.watch(devDir, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
  })

  let isSyncing = false
  let pendingSync = false
  let debounceTimeout: NodeJS.Timeout | null = null

  const triggerSync = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }

    debounceTimeout = setTimeout(async () => {
      if (!activeWatchers.has(skillName)) {
        return // Watcher was stopped/deleted
      }
      if (isSyncing) {
        pendingSync = true
        return
      }

      isSyncing = true
      try {
        console.log(`[Watch] Syncing skill "${skillName}" to targets: ${resolvedTargets.join(', ')}`)

        // 1. Re-import from dev directory into canonical library
        await importSkill(devDir, { force: true }, root)

        // 2. Push to all resolved targets
        for (const t of resolvedTargets) {
          const parts = t.split(':')
          if (parts.length === 2 && parts[1] !== 'user') {
            // Project target: projectId:agentName (e.g. proj_1:claude)
            const [projectId, agent] = parts
            const config = await loadConfig(root)
            const proj = config.projects.find((p) => p.id === projectId)
            if (proj) {
              const freshRegistry = await loadRegistry(root)
              const freshSkill = freshRegistry.skills[skillName]
              if (freshSkill) {
                const planRes = await planProjectSkillInject(proj, freshSkill, agent as any, root)
                await applyProjectSkillInject(planRes.plan.planId, proj.id, { allowManagedModify: true }, root)
              }
            }
          } else {
            // User target: agentName:user (e.g. claude:user)
            const planRes = await planSync(skillName, [t as any], { allowManagedModify: true }, root)
            await applySyncPlan(planRes.plan.planId, { allowManagedModify: true }, root)
          }
        }

        watchStatus.set(skillName, {
          lastSyncedAt: new Date().toISOString(),
          status: 'success',
        })
        console.log(`[Watch] Skill "${skillName}" synced successfully.`)
      } catch (err) {
        const errMsg = (err as Error).message
        console.error(`[Watch] Error syncing skill "${skillName}":`, errMsg)
        watchStatus.set(skillName, {
          lastSyncedAt: new Date().toISOString(),
          status: 'error',
          error: errMsg,
        })
        await logWatchError(skillName, errMsg)
      } finally {
        isSyncing = false
        if (pendingSync) {
          pendingSync = false
          triggerSync()
        }
      }
    }, 800) // 800ms debounce
  }

  watcher.on('all', (event, filePath) => {
    console.log(`[Watch] File change detected: ${event} ${filePath}`)
    triggerSync()
  })

  activeWatchers.set(skillName, watcher)
}

export async function stopWatch(skillName: string): Promise<void> {
  const watcher = activeWatchers.get(skillName)
  if (watcher) {
    await watcher.close()
    activeWatchers.delete(skillName)
    watchStatus.delete(skillName)
    await deletePidFile(`watch-skill-${skillName}`)
    console.log(`[Watch] Stopped watching skill "${skillName}"`)
  }
}

// ==========================================
// Rule Scan implementation (D9 新增 - 手动扫描模式)
// ==========================================

let ruleScanChanges: Array<{ projectId: string; agent: string; lastDetectedAt: string }> = []

export function getRuleScanStatus() {
  return {
    changes: ruleScanChanges,
  }
}

export function clearRuleScanChanges() {
  ruleScanChanges = []
}

export async function runRuleScan(root = process.cwd()) {
  const config = await loadConfig(root)
  const newChanges: Array<{ projectId: string; agent: string; lastDetectedAt: string }> = []

  const { planRuleSync } = await import('../rules/plan.js')

  for (const project of config.projects) {
    const agents: ('claude' | 'codex' | 'gemini')[] = ['claude', 'codex', 'gemini']
    for (const agent of agents) {
      if (project.enabledAgents && !project.enabledAgents.includes(agent)) {
        continue
      }
      if (!project.ruleTemplates?.[agent]) {
        continue
      }
      try {
        const plan = await planRuleSync(project, agent, root)
        if (plan.status === 'changed') {
          newChanges.push({
            projectId: project.id,
            agent,
            lastDetectedAt: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.error(`Failed to scan rules for project ${project.id} agent ${agent}:`, err)
      }
    }
  }

  ruleScanChanges = newChanges
  return { changes: ruleScanChanges }
}
