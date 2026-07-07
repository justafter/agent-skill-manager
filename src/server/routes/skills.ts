import { Router } from 'express'
import { loadConfig } from '../../core/config.js'
import { loadRegistry } from '../../core/registry.js'
import { createAdapters } from '../../adapters/registry.js'
import { identifySkillState } from '../../adapters/scan.js'
import { pathExists } from '../../utils/fs.js'
import type { TargetKey, AgentId } from '../../types/adapter.js'

export function skillsRouter(): Router {
  const router = Router()
  
  router.get('/', async (_req, res, next) => {
    try {
      const config = await loadConfig()
      const registry = await loadRegistry()
      const adapters = createAdapters(config)
      const skills = Object.values(registry.skills)

      const enabledAgents = (Object.keys(adapters) as AgentId[]).filter(
        (agent) => config.targets[agent]?.enabled
      )

      const untracked: Record<TargetKey, { name: string; path: string }[]> = {} as any
      const skillsMap = new Map<string, any>(skills.map(s => [
        s.name,
        {
          ...s,
          targets: {} as Record<TargetKey, string>,
          installedPaths: {} as Record<TargetKey, string>
        }
      ]))

      for (const agent of enabledAgents) {
        const adapter = adapters[agent]
        const targetKey: TargetKey = `${agent}:user`
        const userPath = adapter.getTargetPaths().userSkillPath

        const detected = userPath ? await pathExists(userPath) : false
        untracked[targetKey] = []

        if (detected) {
          const targetSkills = await adapter.scanUserSkills()

          for (const [name, skillObj] of skillsMap.entries()) {
            const targetSkillInfo = targetSkills[name]
            skillObj.targets[targetKey] = identifySkillState(skillObj, targetSkillInfo)
            if (targetSkillInfo && targetSkillInfo.localPath) {
              skillObj.installedPaths[targetKey] = targetSkillInfo.localPath
            }
          }

          untracked[targetKey] = Object.values(targetSkills)
            .filter((t) => !registry.skills[t.name])
            .map((t) => ({ name: t.name, path: t.localPath }))
        } else {
          for (const [name, skillObj] of skillsMap.entries()) {
            skillObj.targets[targetKey] = 'missing'
          }
        }
      }

      // Resolve project-level installed paths using registry.projectInstalls
      // (target => agent:project, project path comes from registered projects).
      const projectById = new Map<string, { path: string; projectSkillPath: string }>()
      for (const p of (config.projects as any[]) || []) {
        projectById.set(p.id, p)
      }
      for (const skillObj of skillsMap.values()) {
        for (const install of (skillObj.projectInstalls || []) as Array<{
          projectId: string
          target: TargetKey
        }>) {
          if (!install.target.endsWith(':project')) continue
          const agent = install.target.split(':')[0] as AgentId
          const adapter = adapters[agent]
          if (!adapter) continue
          const proj = projectById.get(install.projectId)
          const projectSkillBase = adapter.getTargetPaths().projectSkillPath
          if (proj && projectSkillBase) {
            const base = `${proj.path.replace(/\\/g, '/')}/${projectSkillBase.replace(/^\.\//, '')}`.replace(/\/$/, '')
            skillObj.installedPaths[install.target] = `${base}/${skillObj.name}`
          }
        }
      }

      res.json({ skills: Array.from(skillsMap.values()), untracked })
    } catch (error) {
      next(error)
    }
  })

  return router
}
