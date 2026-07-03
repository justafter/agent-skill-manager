import type { AgentId } from './adapter.js'

export type RuleApplyMode = 'overwrite' | 'block' | 'pull-template'

export interface RuleTemplate {
  agent: AgentId
  name: string
  path: string
  content: string
}

export interface RuleBlock {
  agent: AgentId
  start: number
  end: number
  content: string
}

export interface RuleFileState {
  path: string
  exists: boolean
  hasManagedBlock: boolean
  content?: string
}
