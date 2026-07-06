import { Router } from 'express'
import { restoreBackup } from '../../backup/restore.js'

export function restoreRouter(): Router {
  const router = Router()
  router.post('/', async (req, res, next) => {
    try {
      const backupId = req.body.backupId ? String(req.body.backupId) : undefined
      if (!backupId) {
        res.status(400).json({ error: 'Missing backupId parameter' })
        return
      }
      const index = await restoreBackup(backupId)
      res.json({ success: true, index })
    } catch (error) {
      next(error)
    }
  })
  return router
}
