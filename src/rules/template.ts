import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { AgentId } from '../types/adapter.js'
import type { RuleTemplate } from '../types/rule.js'
import { pathExists } from '../utils/fs.js'

export const ruleFileByAgent: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
}

export async function loadRuleTemplate(root: string, agent: AgentId, templateName?: string): Promise<RuleTemplate> {
  const fileName = templateName || ruleFileByAgent[agent]
  const file = path.join(root, agent, fileName)
  return {
    agent,
    name: fileName,
    path: file,
    content: await readFile(file, 'utf8'),
  }
}

export async function listRuleTemplates(root: string, agent: AgentId): Promise<string[]> {
  const dir = path.join(root, agent)
  if (!(await pathExists(dir))) {
    return []
  }
  const files = await readdir(dir)
  return files.filter((f) => f.endsWith('.md'))
}
