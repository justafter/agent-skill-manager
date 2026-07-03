import { Router } from 'express'
import { planSync } from '../../sync/engine.js'

export function syncRouter(): Router {
  const router = Router()
  router.post('/plan', (req, res) => {
    res.json(planSync(String(req.body.source), String(req.body.target)))
  })
  router.post('/apply', (_req, res) => {
    res.status(501).json({ error: 'apply is not implemented yet' })
  })
  return router
}
