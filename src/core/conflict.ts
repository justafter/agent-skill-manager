export type ConflictDecision = 'create' | 'skip' | 'modify' | 'conflict'

export interface ConflictInput {
  targetExists: boolean
  checksumBefore?: string
  checksumAfter: string
  managedBy?: string
}

export function decideConflict(input: ConflictInput): ConflictDecision {
  if (!input.targetExists) return 'create'
  if (input.checksumBefore === input.checksumAfter) return 'skip'
  return input.managedBy === 'AgentSkillManager' ? 'modify' : 'conflict'
}
