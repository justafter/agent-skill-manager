import { Router } from 'express'
import { parseSkillDir } from '../../validation/skill.js'

export function importRouter(): Router {
  const router = Router()
  router.post('/', async (req, res, next) => {
    try {
      res.json(await parseSkillDir(String(req.body.path)))
    } catch (error) {
      next(error)
    }
  })
  return router
}
