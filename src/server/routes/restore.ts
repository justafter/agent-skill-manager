import { Router } from 'express'

export function restoreRouter(): Router {
  const router = Router()
  router.post('/', (_req, res) => {
    res.status(501).json({ error: 'restore is not implemented yet' })
  })
  return router
}
