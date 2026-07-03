import type { Plan, PlanId } from '../types/plan.js'

const DEFAULT_TTL_MS = 15 * 60 * 1000

interface StoredPlan {
  plan: Plan
  expiresAt: number
}

const plans = new Map<PlanId, StoredPlan>()

export function putPlan(plan: Plan, ttlMs = DEFAULT_TTL_MS): void {
  plans.set(plan.planId, {
    plan,
    expiresAt: Date.now() + ttlMs
  })
}

export function getPlan(planId: PlanId): Plan | undefined {
  const stored = plans.get(planId)
  if (!stored) return undefined
  if (stored.expiresAt < Date.now()) {
    plans.delete(planId)
    return undefined
  }
  return stored.plan
}

export function deletePlan(planId: PlanId): void {
  plans.delete(planId)
}
