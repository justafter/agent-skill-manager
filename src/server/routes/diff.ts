import { Router } from 'express'
import { diffText } from '../../rules/diff.js'
import type { AgentId, Scope } from '../../types/adapter.js'

export function diffRouter(): Router {
  const router = Router()
  router.get('/', async (req, res, next) => {
    try {
      if (req.query.before !== undefined || req.query.after !== undefined) {
        const beforeStr = String(req.query.before ?? '')
        const afterStr = String(req.query.after ?? '')
        res.type('text/plain').send(diffText('before', 'after', beforeStr, afterStr))
        return
      }

      const skillName = String(req.query.skill || '')
      const targetKey = String(req.query.target || '')

      if (!skillName || !targetKey) {
        res.status(400).json({ error: 'Missing skill or target parameters' })
        return
      }

      const parts = targetKey.split(':')
      if (parts.length !== 2) {
        res.status(400).json({ error: 'Invalid target key format' })
        return
      }

      const [agent, scope] = parts as [AgentId, Scope]
      if (scope !== 'user') {
        res.status(400).json({ error: 'Unsupported scope (only user is supported)' })
        return
      }

      const { loadRegistry } = await import('../../core/registry.js')
      const registry = await loadRegistry()
      const skill = registry.skills[skillName]
      if (!skill) {
        res.status(404).json({ error: `Skill "${skillName}" not found` })
        return
      }

      const { loadConfig } = await import('../../core/config.js')
      const config = await loadConfig()
      const { createAdapters } = await import('../../adapters/registry.js')
      const adapters = createAdapters(config)
      const adapter = adapters[agent]

      if (!adapter) {
        res.status(404).json({ error: `Adapter for agent "${agent}" not found` })
        return
      }

      const userSkillPath = adapter.getTargetPaths().userSkillPath
      if (!userSkillPath) {
        res.status(400).json({ error: `User skill path for agent "${agent}" is not configured` })
        return
      }

      const path = await import('node:path')
      const sourceDir = path.join(process.cwd(), 'library', 'skills', skillName)
      const targetDir = path.join(userSkillPath, skillName)

      const { pathExists } = await import('../../utils/fs.js')
      if (!(await pathExists(sourceDir))) {
        res.status(404).json({ error: `Source directory does not exist: ${sourceDir}` })
        return
      }

      if (!(await pathExists(targetDir))) {
        res.status(404).json({ error: `Target directory does not exist: ${targetDir}` })
        return
      }

      const { diffDirectories } = await import('../../rules/diff.js')
      const result = await diffDirectories(sourceDir, targetDir)
      res.json(result)
    } catch (error) {
      next(error)
    }
  })
  return router
}
