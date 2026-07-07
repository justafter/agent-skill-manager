import { Router } from 'express'
import { runRuleScan, getRuleScanStatus, clearRuleScanChanges } from '../../core/watch.js'

export function rulesWatchRouter(): Router {
  const router = Router()

  // GET /api/rules/watch/status
  router.get('/status', (_req, res, next) => {
    try {
      const status = getRuleScanStatus()
      res.json(status)
    } catch (error) {
      next(error)
    }
  })

  // POST /api/rules/watch/scan
  router.post('/scan', async (_req, res, next) => {
    try {
      const result = await runRuleScan()
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  // POST /api/rules/watch/clear
  router.post('/clear', (_req, res) => {
    clearRuleScanChanges()
    res.json({ success: true })
  })

  return router
}
