import { Router } from 'express'
import { createManualBackup, listBackups } from '../../backup/create.js'

export function backupRouter(): Router {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      const list = await listBackups()
      res.json({ backups: list })
    } catch (error) {
      next(error)
    }
  })

  router.post('/', async (req, res, next) => {
    try {
      const skillName = req.body.skillName ? String(req.body.skillName) : undefined
      const reason = req.body.reason ? String(req.body.reason) : 'Manual backup via API'
      const index = await createManualBackup(process.cwd(), skillName, reason)
      res.status(201).json(index)
    } catch (error) {
      next(error)
    }
  })

  return router
}
