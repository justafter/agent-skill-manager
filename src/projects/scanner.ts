import path from 'node:path'
import type { Project } from '../types/project.js'
import { pathExists } from '../utils/fs.js'

export interface ProjectScanResult {
  projectId: string
  skillDirs: string[]
  ruleFiles: string[]
}

export async function scanProject(project: Project): Promise<ProjectScanResult> {
  // Note: gemini shares `.agents/skills` with codex at the project level,
  // so we list each path once — the absolute-path Set in `existing()`
  // naturally dedupes since both codex and gemini point at the same string.
  const skillDirs = ['.claude/skills', '.agents/skills']
  const ruleFiles = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']

  return {
    projectId: project.id,
    skillDirs: await existing(project.path, skillDirs),
    ruleFiles: await existing(project.path, ruleFiles)
  }
}

async function existing(root: string, relativePaths: string[]): Promise<string[]> {
  const found: string[] = []
  for (const relative of relativePaths) {
    const absolute = path.join(root, relative)
    if (await pathExists(absolute)) found.push(absolute)
  }
  return found
}
