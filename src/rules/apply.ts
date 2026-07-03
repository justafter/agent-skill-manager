import type { AgentId } from '../types/adapter.js'
import { replaceManagedBlock } from './block.js'

export function applyManagedRuleBlock(current: string, agent: AgentId, template: string): string {
  return replaceManagedBlock(current, agent, template.trim())
}
