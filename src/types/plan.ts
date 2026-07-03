export type PlanId = `pl_${string}`

export type PlanItem =
  | { kind: 'create'; target: string; bytes: number }
  | { kind: 'modify'; target: string; checksumBefore: string; checksumAfter: string }
  | { kind: 'skip'; target: string; reason: 'identical' }
  | { kind: 'conflict'; target: string; managedBy?: string; checksumBefore: string; checksumAfter: string }
  | { kind: 'delete'; target: string }

export interface Plan {
  planId: PlanId
  createdAt: string
  source: string
  items: PlanItem[]
  backupId?: string
}

export interface PlanResult {
  plan: Plan
  summary: Record<PlanItem['kind'], number>
}

export interface ApplyResult {
  planId: PlanId
  applied: PlanItem[]
  skipped: PlanItem[]
}
