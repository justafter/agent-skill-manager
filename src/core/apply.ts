import type { ApplyResult, PlanId } from '../types/plan.js'
import { applySyncPlan } from '../sync/engine.js'

export async function applyPlan(planId: PlanId): Promise<ApplyResult> {
  return applySyncPlan(planId)
}
