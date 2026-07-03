import type { ApplyResult, PlanId } from '../types/plan.js'
import { deletePlan, getPlan } from './state.js'

export async function applyPlan(planId: PlanId): Promise<ApplyResult> {
  const plan = getPlan(planId)
  if (!plan) {
    throw new Error(`Plan not found or expired: ${planId}`)
  }

  const applied = plan.items.filter((item) => item.kind !== 'skip' && item.kind !== 'conflict')
  const skipped = plan.items.filter((item) => item.kind === 'skip' || item.kind === 'conflict')

  deletePlan(planId)

  return {
    planId,
    applied,
    skipped
  }
}
