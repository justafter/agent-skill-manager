import { readFile, writeFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { AgentId } from '../types/adapter.js'
import type { BackupIndex, BackupItem } from '../types/backup.js'
import { loadConfig } from '../core/config.js'
import { loadRuleTemplate } from './template.js'
import { findManagedBlock, replaceManagedBlock } from './block.js'
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
  root = process.cwd(),
  templateDir?: string
): Promise<void> {
  const config = await loadConfig(root)
  const project = config.projects.find((p) => p.id === projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" not registered.`)
  }

  const fileName = ruleFileByAgent[agent]
  const targetPath = path.join(project.path, fileName)

  const dir = templateDir || path.join(root, 'library', 'rules')
  const templatePath = path.join(dir, agent, fileName)
  const template = await loadRuleTemplate(dir, agent)
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

export type CrossSyncMode = 'block' | 'overwrite'

/**
 * Cross-agent rule sync within a single project.
 *
 * Reads the project-level rule file for `sourceAgent` and writes its content
 * into the project-level rule file for `targetAgent`. This is useful when an
 * operator wants to keep CLAUDE.md / AGENTS.md / GEMINI.md consistent inside
 * the same project — they edit one file, then "cross-push" to the others.
 *
 * Modes mirror the existing push modes:
 *   - `block`     : keep the target agent's managed block (if any) intact;
 *                   replace only the source agent's managed block in the target,
 *                   using the source file's content as the new block body.
 *                   For cross-agent use this is intentionally narrow: the source
 *                   agent's managed block is extracted and re-applied as a
 *                   <targetAgent> managed block in the target file.
 *   - `overwrite` : fully replace the target file with the source file content
 *                   (still scoped to the target agent's managed block via
 *                   overwrite — see body for nuance).
 *
 * Constraints:
 *   - Both files must exist inside the registered project path.
 *   - Both files must contain a managed block (block mode); for cross-agent
 *     block mode, the source file must contain a `<sourceAgent>` managed block
 *     and the target file must contain (or accept) a `<targetAgent>` block.
 *   - Source file is backed up before any write that would alter the project.
 */
export async function crossSyncRule(
  projectId: string,
  sourceAgent: AgentId,
  targetAgent: AgentId,
  mode: CrossSyncMode,
  root = process.cwd()
): Promise<void> {
  if (sourceAgent === targetAgent) {
    throw new Error(`crossSyncRule: sourceAgent and targetAgent must differ (got "${sourceAgent}").`)
  }

  const config = await loadConfig(root)
  const project = config.projects.find((p) => p.id === projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" not registered.`)
  }

  const sourceFile = ruleFileByAgent[sourceAgent]
  const targetFile = ruleFileByAgent[targetAgent]
  const sourcePath = path.join(project.path, sourceFile)
  const targetPath = path.join(project.path, targetFile)

  // Both paths must remain inside the project (defence in depth).
  await assertInsideProject(project.path, sourcePath)
  await assertInsideProject(project.path, targetPath)

  if (!(await pathExists(sourcePath))) {
    throw new Error(`Source rule file does not exist: ${sourcePath}`)
  }

  const sourceContent = await readFile(sourcePath, 'utf8')

  // Backup target file (the one we're about to mutate)
  await assertSafeWritePath(targetPath, config)
  if (await pathExists(targetPath)) {
    await backupRuleFile(root, config.backupDir, targetPath, `Cross-sync backup: ${sourceAgent} → ${targetAgent} for project ${project.name}`, {
      type: 'rule',
      projectId,
      originalPath: targetPath,
      targetType: 'project',
      targetAgent
    })
  }

  if (mode === 'overwrite') {
    await writeFile(targetPath, sourceContent, 'utf8')
    return
  }

  // mode === 'block'
  const sourceBlock = findManagedBlock(sourceContent, sourceAgent)
  if (!sourceBlock) {
    throw new Error(
      `crossSyncRule: source file has no managed block for "${sourceAgent}". ` +
        `Run overwrite mode or add a managed block to ${sourceFile} first.`
    )
  }
  const targetBlockContent = sourceBlock.content
  // Extract inner content (without the BEGIN/END markers) so we can re-emit
  // it as a managed block scoped to the target agent.
  const innerContent = extractInner(targetBlockContent, sourceAgent)

  if (!(await pathExists(targetPath))) {
    const wrapped = `<!-- BEGIN AgentSkillManager:${targetAgent} -->\n${innerContent}\n<!-- END AgentSkillManager:${targetAgent} -->\n`
    await writeFile(targetPath, wrapped, 'utf8')
    return
  }

  const currentTargetContent = await readFile(targetPath, 'utf8')
  const nextBlock = `<!-- BEGIN AgentSkillManager:${targetAgent} -->\n${innerContent}\n<!-- END AgentSkillManager:${targetAgent} -->`
  const finalContent = replaceManagedBlock(currentTargetContent, targetAgent, nextBlock)
  await writeFile(targetPath, finalContent, 'utf8')
}

function extractInner(block: string, agent: AgentId): string {
  const begin = `<!-- BEGIN AgentSkillManager:${agent} -->`
  const end = `<!-- END AgentSkillManager:${agent} -->`
  const startIdx = block.indexOf(begin)
  const endIdx = block.lastIndexOf(end)
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return block.trim()
  return block.slice(startIdx + begin.length, endIdx).trim()
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
