import type { AgentId } from '../types/adapter.js'
import type { RuleBlock } from '../types/rule.js'

export function findManagedBlock(content: string, agent: AgentId): RuleBlock | null {
  const pattern = new RegExp(`<!-- BEGIN AgentSkillManager:${agent} -->[\\s\\S]*?<!-- END AgentSkillManager:${agent} -->`, 'm')
  const match = pattern.exec(content)
  if (!match || match.index === undefined) return null

  return {
    agent,
    start: match.index,
    end: match.index + match[0].length,
    content: match[0]
  }
}

export function replaceManagedBlock(content: string, agent: AgentId, nextBlock: string): string {
  const block = findManagedBlock(content, agent)
  if (!block) return `${content.trimEnd()}\n\n${nextBlock}\n`
  return `${content.slice(0, block.start)}${nextBlock}${content.slice(block.end)}`
}
