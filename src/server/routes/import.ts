import { Router } from 'express'
import { importSkill } from '../../core/import.js'

export function importRouter(): Router {
  const router = Router()
  
  router.post('/', async (req, res, next) => {
    try {
      const sourcePath = String(req.body.path || '')
      const force = !!req.body.force
      const skip = !!req.body.skip

      if (!sourcePath) {
        res.status(400).json({ error: 'Missing path parameter' })
        return
      }

      const result = await importSkill(sourcePath, { force, skip })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
