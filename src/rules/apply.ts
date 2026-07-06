import { readFile, writeFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { AgentId } from '../types/adapter.js'
import type { BackupIndex, BackupItem } from '../types/backup.js'
import { loadConfig } from '../core/config.js'
import { loadRuleTemplate } from './template.js'
import { findManagedBlock } from './block.js'
import { assertInsideProject, assertSafeWritePath } from '../projects/guard.js'
import { pathExists, ensureDir, atomicWriteJson } from '../utils/fs.js'

const ruleFileByAgent: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md'
}

export async function applyRuleSync(
  projectId: string,
  agent: AgentId,
  mode: 'block' | 'overwrite' | 'pull',
  root = process.cwd()
): Promise<void> {
  const config = await loadConfig(root)
  const project = config.projects.find((p) => p.id === projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" not registered.`)
  }

  const fileName = ruleFileByAgent[agent]
  const targetPath = path.join(project.path, fileName)

  const templateDir = path.join(root, 'library', 'rules')
  const templatePath = path.join(templateDir, agent, fileName)
  const template = await loadRuleTemplate(templateDir, agent)
  const templateContent = template.content.trim()

  if (mode === 'pull') {
    // 1. Pull rules from project to update local template
    if (!(await pathExists(targetPath))) {
      throw new Error(`Project rules file does not exist to pull from: ${targetPath}`)
    }

    const currentContent = await readFile(targetPath, 'utf8')
    const block = findManagedBlock(currentContent, agent)
    let newTemplateContent = ''

    if (block) {
      newTemplateContent = block.content.trim() + '\n'
    } else {
      // If no managed block, we do NOT extract. We throw error to prevent corrupting local templates.
      throw new Error(`Project rules file does not contain a managed block to pull: ${targetPath}`)
    }

    // Backup local template first
    if (await pathExists(templatePath)) {
      await backupRuleFile(root, config.backupDir, templatePath, `Pull backup for local template: ${agent}`, {
        type: 'rule',
        originalPath: templatePath,
        targetType: 'user'
      })
    }

    await ensureDir(path.dirname(templatePath))
    await writeFile(templatePath, newTemplateContent, 'utf8')
  } else {
    // 2. Push rules from local template to project
    await assertInsideProject(project.path, targetPath)
    await assertSafeWritePath(targetPath, config)

    // Backup project rule file if it exists
    if (await pathExists(targetPath)) {
      await backupRuleFile(root, config.backupDir, targetPath, `Sync backup for project rules: ${project.name} (${agent})`, {
        type: 'rule',
        projectId,
        originalPath: targetPath,
        targetType: 'project',
        targetAgent: agent
      })
    }

    if (mode === 'overwrite') {
      await writeFile(targetPath, templateContent + '\n', 'utf8')
    } else if (mode === 'block') {
      if (!(await pathExists(targetPath))) {
        await writeFile(targetPath, templateContent + '\n', 'utf8')
      } else {
        const currentContent = await readFile(targetPath, 'utf8')
        const block = findManagedBlock(currentContent, agent)
        let finalContent = ''

        if (block) {
          finalContent = `${currentContent.slice(0, block.start)}${templateContent}${currentContent.slice(block.end)}`
        } else {
          // If no block exists, block mode appends it to the end
          finalContent = `${currentContent.trimEnd()}\n\n${templateContent}\n`
        }
        await writeFile(targetPath, finalContent, 'utf8')
      }
    }
  }
}

async function backupRuleFile(
  root: string,
  backupDir: string,
  originalPath: string,
  reason: string,
  itemMeta: Partial<BackupItem>
): Promise<string> {
  const timestamp = Date.now()
  const uuid8 = randomUUID().slice(0, 8)
  const backupId = `bk_${timestamp}_${uuid8}`
  const destDir = path.resolve(root, backupDir, backupId)
  await ensureDir(destDir)

  const items: BackupItem[] = []

  // 1. Backup registry snapshot if exists
  const registryPath = path.join(root, 'library', 'registry.json')
  if (await pathExists(registryPath)) {
    const backupRegistryPath = path.join(destDir, 'registry-snapshot.json')
    const raw = await readFile(registryPath, 'utf8')
    await writeFile(backupRegistryPath, raw)
    items.push({
      type: 'registry',
      originalPath: registryPath,
      backupPath: backupRegistryPath
    })
  }

  // 2. Backup rules file
  const fileName = path.basename(originalPath)
  const backupPath = path.join(destDir, itemMeta.targetType === 'project' ? 'project' : 'user', fileName)
  await ensureDir(path.dirname(backupPath))
  
  const content = await readFile(originalPath, 'utf8')
  await writeFile(backupPath, content, 'utf8')

  items.push({
    type: 'rule',
    originalPath,
    backupPath,
    ...itemMeta
  })

  const index: BackupIndex = {
    backupId,
    createdAt: new Date().toISOString(),
    reason,
    items
  }

  await atomicWriteJson(path.join(destDir, 'index.json'), index)
  return backupId
}
