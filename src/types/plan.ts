import type { TargetKey } from './adapter.js'

export type PlanId = `pl_${string}`

export type PlanItem =
  | { kind: 'create'; target: string; bytes: number; targetKey?: TargetKey; targetDir?: string }
  | {
      kind: 'modify'
      target: string
      checksumBefore: string
      checksumAfter: string
      targetKey?: TargetKey
      targetDir?: string
    }
  | { kind: 'skip'; target: string; reason: 'identical'; targetKey?: TargetKey; targetDir?: string }
  | {
      kind: 'conflict'
      target: string
      managedBy?: string
      checksumBefore: string
      checksumAfter: string
      targetKey?: TargetKey
      targetDir?: string
    }
  | { kind: 'delete'; target: string; targetKey?: TargetKey; targetDir?: string }

export interface Plan {
  planId: PlanId
  createdAt: string
  source: string
  items: PlanItem[]
  backupId?: string
  executedAt?: string
  appliedItems?: PlanItem[]
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
