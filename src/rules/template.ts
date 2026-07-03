import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AgentId } from '../types/adapter.js'
import type { RuleTemplate } from '../types/rule.js'

const ruleFileByAgent: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md'
}

export async function loadRuleTemplate(root: string, agent: AgentId): Promise<RuleTemplate> {
  const file = path.join(root, agent, ruleFileByAgent[agent])
  return {
    agent,
    name: ruleFileByAgent[agent],
    path: file,
    content: await readFile(file, 'utf8')
  }
}
