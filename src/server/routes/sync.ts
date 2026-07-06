import { Router } from 'express'
import { planSync, applySyncPlan } from '../../sync/engine.js'
import type { PlanId } from '../../types/plan.js'
import type { TargetKey } from '../../types/adapter.js'

export function syncRouter(): Router {
  const router = Router()
  
  router.post('/plan', async (req, res, next) => {
    try {
      const skillName = String(req.body.skillName || '')
      const targets = req.body.targets as TargetKey[] | undefined
      const allowManagedModify = !!req.body.allowManagedModify

      if (!skillName) {
        res.status(400).json({ error: 'Missing skillName parameter' })
        return
      }

      const result = await planSync(skillName, targets, { allowManagedModify })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/apply', async (req, res, next) => {
    try {
      const planId = req.body.planId as PlanId
      const allowManagedModify = !!req.body.allowManagedModify

      if (!planId) {
        res.status(400).json({ error: 'Missing planId parameter' })
        return
      }

      const result = await applySyncPlan(planId, { allowManagedModify })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
