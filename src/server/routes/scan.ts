import { Router } from 'express'

export function scanRouter(): Router {
  const router = Router()
  router.post('/', (_req, res) => {
    res.status(202).json({ accepted: true })
  })
  return router
}
