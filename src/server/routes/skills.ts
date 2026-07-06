import { Router } from 'express'
import { loadRegistry } from '../../core/registry.js'

export function skillsRouter(): Router {
  const router = Router()
  router.get('/', async (_req, res, next) => {
    try {
      const registry = await loadRegistry()
      res.json({ skills: Object.values(registry.skills) })
    } catch (error) {
      next(error)
    }
  })
  return router
}
