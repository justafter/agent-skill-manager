import { Router } from 'express'

export function backupRouter(): Router {
  const router = Router()
  router.get('/', (_req, res) => {
    res.json({ backups: [] })
  })
  return router
}
