import { Router } from 'express'
import { loadConfig } from '../../core/config.js'
import { loadRegistry } from '../../core/registry.js'
import { createAdapters } from '../../adapters/registry.js'
import { identifySkillState } from '../../adapters/scan.js'
import { scanDevelopmentSkills } from '../../core/development-scan.js'
import { resolveCanonicalSkillStates } from '../../core/canonical-skill.js'
import { pathExists } from '../../utils/fs.js'
import type { TargetKey, AgentId } from '../../types/adapter.js'

export function scanRouter(): Router {
  const router = Router()
  router.post('/', async (_req, res, next) => {
    try {
      const config = await loadConfig()
      const registry = await loadRegistry()
      const adapters = createAdapters(config)
      const skills = Object.values(registry.skills)
      const canonicalSkills = await resolveCanonicalSkillStates(skills)
      const canonicalSkillMap = new Map(canonicalSkills.map((skill) => [skill.name, skill]))

      const enabledAgents = (Object.keys(adapters) as AgentId[]).filter((agent) => config.targets[agent]?.enabled)

      const results: Record<TargetKey, Record<string, string>> = {} as any
      const untracked: Record<TargetKey, string[]> = {} as any
      const development = await scanDevelopmentSkills(skills)

      for (const agent of enabledAgents) {
        const adapter = adapters[agent]
        const targetKey: TargetKey = `${agent}:user`
        const userPath = adapter.getTargetPaths().userSkillPath

        const detected = userPath ? await pathExists(userPath) : false
        results[targetKey] = {}
        untracked[targetKey] = []

        if (detected) {
          const targetSkills = await adapter.scanUserSkills()

          for (const skill of skills) {
            const targetSkillInfo = targetSkills[skill.name]
            results[targetKey][skill.name] = identifySkillState(canonicalSkillMap.get(skill.name), targetSkillInfo)
          }

          untracked[targetKey] = Object.keys(targetSkills).filter((name) => !registry.skills[name])
        } else {
          for (const skill of skills) {
            results[targetKey][skill.name] = 'missing'
          }
        }
      }

      res.json({ results, untracked, development })
    } catch (error) {
      next(error)
    }
  })
  return router
}
