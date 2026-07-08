import { Router } from 'express'
import { AppError } from '../../utils/errors.js'
import { restoreBackup } from '../../backup/restore.js'

export function restoreRouter(): Router {
  const router = Router()
  router.post('/', async (req, res, next) => {
    try {
      const backupId = req.body.backupId ? String(req.body.backupId) : undefined
      if (!backupId) {
        throw new AppError('VALIDATION_ERROR', 'Missing backupId parameter')
      }
      const index = await restoreBackup(backupId)
      res.json({ success: true, index })
    } catch (error) {
      next(error)
    }
  })
  return router
}
