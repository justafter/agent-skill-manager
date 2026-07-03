import { Router } from 'express'

export function watchRouter(): Router {
  const router = Router()
  router.post('/start', (_req, res) => {
    res.status(501).json({ error: 'watch start is not implemented yet' })
  })
  router.post('/stop', (_req, res) => {
    res.status(501).json({ error: 'watch stop is not implemented yet' })
  })
  return router
}
