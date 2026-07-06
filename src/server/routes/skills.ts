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

      const untracked: Record<TargetKey, string[]> = {} as any
      const skillsMap = new Map<string, any>(skills.map(s => [s.name, { ...s, targets: {} }]))

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
          }

          untracked[targetKey] = Object.keys(targetSkills).filter(
            (name) => !registry.skills[name]
          )
        } else {
          for (const [name, skillObj] of skillsMap.entries()) {
            skillObj.targets[targetKey] = 'missing'
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
