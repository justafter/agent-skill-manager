import { Router } from 'express'
import { diffText } from '../../rules/diff.js'

export function diffRouter(): Router {
  const router = Router()
  router.get('/', (req, res) => {
    res.type('text/plain').send(diffText('before', 'after', String(req.query.before ?? ''), String(req.query.after ?? '')))
  })
  return router
}
