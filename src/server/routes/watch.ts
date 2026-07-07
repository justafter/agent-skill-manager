import { Router } from 'express'
import { startWatch, stopWatch, getAllWatchStatuses } from '../../core/watch.js'
import { AppError } from '../../utils/errors.js'

export function watchRouter(): Router {
  const router = Router()

  // GET /api/watch/status - Get all active watches
  router.get('/status', (_req, res, next) => {
    try {
      const statuses = getAllWatchStatuses()
      res.json({ watches: statuses })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/watch/start - Start watching a skill
  router.post('/start', async (req, res, next) => {
    try {
      const { skillName, targets } = req.body
      if (!skillName) {
        throw new AppError('VALIDATION_ERROR', 'skillName is required.')
      }
      const targetList = targets ? String(targets).split(',').map((t) => t.trim()) : undefined
      await startWatch(skillName, targetList)
      res.json({ success: true, message: `Watch started for skill: ${skillName}` })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/watch/stop - Stop watching a skill
  router.post('/stop', async (req, res, next) => {
    try {
      const { skillName } = req.body
      if (!skillName) {
        throw new AppError('VALIDATION_ERROR', 'skillName is required.')
      }
      await stopWatch(skillName)
      res.json({ success: true, message: `Watch stopped for skill: ${skillName}` })
    } catch (error) {
      next(error)
    }
  })

  return router
}
