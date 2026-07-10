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
  gemini: 'GEMINI.md',
}

export interface RuleSyncPlan {
  projectId: string
  agent: AgentId
  targetPath: string
  status: 'create' | 'identical' | 'changed'
  currentContent: string
  templateContent: string
  expectedContent: string
  patch: string
  templateName: string
}

export async function planRuleSync(
  project: Project,
  agent: AgentId,
  root = process.cwd(),
  templateDir?: string,
): Promise<RuleSyncPlan> {
  const fileName = ruleFileByAgent[agent]
  const targetPath = path.join(project.path, fileName)

  const configuredTemplateName = project.ruleTemplates?.[agent]
  if (!configuredTemplateName) {
    throw new Error(
      `Project is not associated with any template for agent "${agent}". Please associate a template first.`,
    )
  }

  // Load local rule template from <templateDir> or fall back to <root>/library/rules
  const dir = templateDir || path.join(root, 'library', 'rules')
  const template = await loadRuleTemplate(dir, agent, configuredTemplateName)
  const templateContent = template.content.trim()

  let currentContent = ''
  let status: 'create' | 'identical' | 'changed'
  let expectedContent = templateContent + '\n'

  if (!(await pathExists(targetPath))) {
    status = 'create'
    currentContent = ''
  } else {
    currentContent = await readFile(targetPath, 'utf8')
    if (currentContent.trim() === templateContent.trim()) {
      status = 'identical'
      expectedContent = currentContent
    } else {
      status = 'changed'
    }
  }

  const patch = diffText(`project/${fileName}`, `expected/${fileName}`, currentContent, expectedContent)

  return {
    projectId: project.id,
    agent,
    targetPath,
    status,
    currentContent,
    templateContent,
    expectedContent,
    patch,
    templateName: template.name,
  }
}
