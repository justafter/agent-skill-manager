import { Router } from 'express'
import { loadConfig } from '../../core/config.js'

export function configRouter(): Router {
  const router = Router()
  router.get('/', async (_req, res, next) => {
    try {
      res.json(await loadConfig())
    } catch (error) {
      next(error)
    }
  })
  return router
}