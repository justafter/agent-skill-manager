import { randomUUID } from 'node:crypto'
import type { Plan, PlanId, PlanItem, PlanResult } from '../types/plan.js'
import { putPlan } from './state.js'

export interface CreatePlanInput {
  source: string
  items?: PlanItem[]
  backupId?: string
}

export function createPlan(input: CreatePlanInput): PlanResult {
  const plan: Plan = {
    planId: `pl_${randomUUID()}` as PlanId,
    createdAt: new Date().toISOString(),
    source: input.source,
    items: input.items ?? [],
    backupId: input.backupId
  }

  putPlan(plan)

  return {
    plan,
    summary: summarizePlanItems(plan.items)
  }
}

export function summarizePlanItems(items: PlanItem[]): PlanResult['summary'] {
  return {
    create: items.filter((item) => item.kind === 'create').length,
    modify: items.filter((item) => item.kind === 'modify').length,
    skip: items.filter((item) => item.kind === 'skip').length,
    conflict: items.filter((item) => item.kind === 'conflict').length,
    delete: items.filter((item) => item.kind === 'delete').length
  }
}
