import { rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { loadRegistry, saveRegistry } from './registry.js'
import { parseSkillDir } from '../validation/skill.js'
import { copyDirectory } from '../sync/copy.js'
import { pathExists, ensureDir } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'
import { loadConfig } from './config.js'
import { assertSafeWritePath } from '../projects/guard.js'
import { backupSkillAndRegistry } from '../backup/create.js'
import type { SkillState } from '../types/skill.js'

export interface ImportOptions {
  force?: boolean
  skip?: boolean
}

export interface ImportResult {
  status: 'imported' | 'skipped' | 'updated'
  skill: SkillState
  backupId?: string
}

export async function importSkill(
  skillPath: string,
  options: ImportOptions = {},
  root = process.cwd()
): Promise<ImportResult> {
  // 1. Resolve and parse skill directory metadata
  const resolvedPath = path.resolve(skillPath)
  const meta = await parseSkillDir(resolvedPath)

  // 2. Load configuration & verify safe target path
  const config = await loadConfig(root)
  const targetDir = path.join(root, 'library', 'skills', meta.name)
  await assertSafeWritePath(targetDir, config)

  // 3. Load registry and check duplicate entries
  const registry = await loadRegistry(root)
  const existing = registry.skills[meta.name]

  let backupId: string | undefined

  if (existing) {
    // If checksum is identical, skip it
    if (existing.checksum === meta.checksum) {
      return {
        status: 'skipped',
        skill: existing
      }
    }

    if (options.skip) {
      return {
        status: 'skipped',
        skill: existing
      }
    }

    if (!options.force) {
      throw new AppError(
        'SKILL_ALREADY_EXISTS',
        `Skill "${meta.name}" already exists with a different checksum. Use --force to overwrite.`,
        { name: meta.name, existingChecksum: existing.checksum, newChecksum: meta.checksum }
      )
    }

    // Force option: perform registry and physical skill file backup
    const backupIndex = await backupSkillAndRegistry(
      root,
      config.backupDir,
      meta.name,
      `Force override skill "${meta.name}"`
    )
    backupId = backupIndex.backupId
  }

  // 4. Safe copy: copy into a temporary sibling first, then replace the target.
  const skillsRoot = path.dirname(targetDir)
  const tempDir = path.join(skillsRoot, `.${meta.name}.import-${process.pid}-${Date.now()}`)
  await ensureDir(skillsRoot)
  await rm(tempDir, { recursive: true, force: true })
  try {
    await copyDirectory(resolvedPath, tempDir)
    if (await pathExists(targetDir)) {
      await rm(targetDir, { recursive: true, force: true })
    }
    await rename(tempDir, targetDir)
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }

  const canonicalMeta = await parseSkillDir(targetDir)

  // 5. Save metadata into the registry
  const updatedSkill: SkillState = {
    ...canonicalMeta,
    localPath: resolvedPath, // original source developer directory
    syncedTargets: existing ? existing.syncedTargets : [],
    projectInstalls: existing ? existing.projectInstalls : []
  }

  registry.skills[meta.name] = updatedSkill
  await saveRegistry(registry, root)

  return {
    status: existing ? 'updated' : 'imported',
    skill: updatedSkill,
    backupId
  }
}
