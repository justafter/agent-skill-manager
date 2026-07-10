import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { AgentId } from '../types/adapter.js'
import type { RuleTemplate } from '../types/rule.js'
import { pathExists, ensureDir, atomicWriteFile } from '../utils/fs.js'
import { findManagedBlock } from './block.js'

export const ruleFileByAgent: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
}

export async function loadRuleTemplate(root: string, agent: AgentId, templateName?: string): Promise<RuleTemplate> {
  const fileName = templateName || ruleFileByAgent[agent]
  
  // 优先在当前 agent 文件夹下查找，其次在所有其他 agent 文件夹下搜寻
  const candidates = [
    path.join(root, agent, fileName),
    path.join(root, 'claude', fileName),
    path.join(root, 'codex', fileName),
    path.join(root, 'gemini', fileName),
  ]

  let targetFile = ''
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      targetFile = candidate
      break
    }
  }

  if (!targetFile) {
    targetFile = path.join(root, agent, fileName)
  }

  return {
    agent,
    name: fileName,
    path: targetFile,
    content: await readFile(targetFile, 'utf8'),
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

export async function importRuleTemplate(
  templateDir: string,
  sourcePath: string,
  agent: AgentId,
  name: string,
): Promise<{ success: boolean; path: string }> {
  const templatePath = path.join(templateDir, agent, name)

  // 校验源文件是否存在
  if (!(await pathExists(sourcePath))) {
    throw new Error(`源规则文件不存在，请检查输入路径是否正确：${sourcePath}`)
  }

  // 校验目标模板是否已存在
  if (await pathExists(templatePath)) {
    throw new Error(`规则模板库中已存在同名模板 "${name}"，请在“目标模板名称”中输入另一个不同的名字（以 .md 结尾）。`)
  }

  const content = await readFile(sourcePath, 'utf8')
  await ensureDir(path.dirname(templatePath))
  await atomicWriteFile(templatePath, content)
  return { success: true, path: templatePath }
}
