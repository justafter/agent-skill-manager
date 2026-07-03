import { Router } from 'express'

export function skillsRouter(): Router {
  const router = Router()
  router.get('/', (_req, res) => {
    res.json({ skills: [] })
  })
  return router
}
