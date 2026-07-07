import { Router } from 'express'
import { planSync, applySyncPlan } from '../../sync/engine.js'
import type { PlanId } from '../../types/plan.js'
import type { TargetKey } from '../../types/adapter.js'
import { AppError } from '../../utils/errors.js'

export function syncRouter(): Router {
  const router = Router()

  router.post('/plan', async (req, res, next) => {
    try {
      const skillName = String(req.body.skillName || '')
      const targets = req.body.targets as TargetKey[] | undefined
      const from = req.body.from as TargetKey | undefined
      const allowManagedModify = !!req.body.allowManagedModify
      const allowConflictOverwrite = !!req.body.allowConflictOverwrite

      if (!skillName) {
        throw new AppError('VALIDATION_ERROR', 'Missing skillName parameter')
      }

      const result = await planSync(skillName, targets, { allowManagedModify, allowConflictOverwrite, from }, process.cwd())
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/apply', async (req, res, next) => {
    try {
      const planId = req.body.planId as PlanId
      const allowManagedModify = !!req.body.allowManagedModify
      const allowConflictOverwrite = !!req.body.allowConflictOverwrite

      if (!planId) {
        throw new AppError('VALIDATION_ERROR', 'Missing planId parameter')
      }

      const result = await applySyncPlan(planId, { allowManagedModify, allowConflictOverwrite }, process.cwd())
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
