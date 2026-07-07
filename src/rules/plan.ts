import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { AgentId } from '../types/adapter.js'
import type { Project } from '../types/project.js'
import { loadRuleTemplate } from './template.js'
import { findManagedBlock } from './block.js'
import { diffText } from './diff.js'
import { pathExists } from '../utils/fs.js'

const ruleFileByAgent: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md'
}

export interface RuleSyncPlan {
  projectId: string
  agent: AgentId
  targetPath: string
  status: 'create' | 'identical' | 'block' | 'conflict'
  currentContent: string
  templateContent: string
  expectedContent: string
  patch: string
}

export async function planRuleSync(
  project: Project,
  agent: AgentId,
  root = process.cwd(),
  templateDir?: string
): Promise<RuleSyncPlan> {
  const fileName = ruleFileByAgent[agent]
  const targetPath = path.join(project.path, fileName)

  // Load local rule template from <templateDir> or fall back to <root>/library/rules
  const dir = templateDir || path.join(root, 'library', 'rules')
  const template = await loadRuleTemplate(dir, agent)
  const templateContent = template.content.trim()

  let currentContent = ''
  let status: 'create' | 'identical' | 'block' | 'conflict'
  let expectedContent = ''

  if (!(await pathExists(targetPath))) {
    status = 'create'
    currentContent = ''
    expectedContent = templateContent + '\n'
  } else {
    currentContent = await readFile(targetPath, 'utf8')
    const block = findManagedBlock(currentContent, agent)

    if (block) {
      if (block.content.trim() === templateContent) {
        status = 'identical'
        expectedContent = currentContent
      } else {
        status = 'block'
        expectedContent = `${currentContent.slice(0, block.start)}${templateContent}${currentContent.slice(block.end)}`
      }
    } else {
      status = 'conflict'
      expectedContent = templateContent + '\n'
    }
  }

  const patch = diffText(
    `project/${fileName}`,
    `expected/${fileName}`,
    currentContent,
    expectedContent
  )

  return {
    projectId: project.id,
    agent,
    targetPath,
    status,
    currentContent,
    templateContent,
    expectedContent,
    patch
  }
}
