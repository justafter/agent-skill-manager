import { Router } from 'express'
import { createManualBackup, listBackups } from '../../backup/create.js'
import { deleteBackup } from '../../backup/delete.js'
import { loadConfig } from '../../core/config.js'

export function backupRouter(): Router {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      const list = await listBackups()
      const config = await loadConfig(process.cwd())
      res.json({ backups: list, backupDir: config.backupDir })
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

  // DELETE /api/backups/:id — delete a single backup archive.
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id ? String(req.params.id) : ''
      const result = await deleteBackup(id, process.cwd())
      res.json({ success: true, ...result })
    } catch (error) {
      next(error)
    }
  })

  return router
}
