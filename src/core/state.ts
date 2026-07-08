import type { Plan, PlanId, PlanItem } from '../types/plan.js'

const DEFAULT_TTL_MS = 15 * 60 * 1000

interface StoredPlan {
  plan: Plan
  expiresAt: number
}

const plans = new Map<PlanId, StoredPlan>()

export function putPlan(plan: Plan, ttlMs = DEFAULT_TTL_MS): void {
  plans.set(plan.planId, {
    plan,
    expiresAt: Date.now() + ttlMs,
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

export function markExecuted(planId: PlanId, appliedItems: PlanItem[]): void {
  const stored = plans.get(planId)
  if (!stored) return
  stored.plan.executedAt = new Date().toISOString()
  stored.plan.appliedItems = appliedItems
}

export function getPlanStatus(planId: PlanId): {
  status: 'pending' | 'executed' | 'expired'
  plan?: Plan
  executedAt?: string
  appliedItems?: PlanItem[]
} {
  const stored = plans.get(planId)
  if (!stored) {
    return { status: 'expired' }
  }
  if (stored.expiresAt < Date.now()) {
    plans.delete(planId)
    return { status: 'expired' }
  }
  if (stored.plan.executedAt) {
    return {
      status: 'executed',
      plan: stored.plan,
      executedAt: stored.plan.executedAt,
      appliedItems: stored.plan.appliedItems,
    }
  }
  return {
    status: 'pending',
    plan: stored.plan,
  }
}
