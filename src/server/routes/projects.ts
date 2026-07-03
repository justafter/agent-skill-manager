import { Router } from 'express'

export function projectsRouter(): Router {
  const router = Router()
  router.get('/', (_req, res) => {
    res.json({ projects: [] })
  })
  return router
}
