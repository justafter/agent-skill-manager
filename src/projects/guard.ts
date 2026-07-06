import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { isPathInside } from '../utils/paths.js'
import { pathExists } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'
import type { ResolvedConfig } from '../types/config.js'

export async function resolveRealpath(targetPath: string): Promise<string> {
  const resolved = path.resolve(targetPath)
  let current = resolved
  while (current && current !== path.dirname(current)) {
    if (await pathExists(current)) {
      const real = await realpath(current)
      const relative = path.relative(current, resolved)
      return path.resolve(real, relative)
    }
    current = path.dirname(current)
  }
  return resolved
}

export async function assertSafeWritePath(targetPath: string, config: ResolvedConfig): Promise<void> {
  const resolvedTarget = await resolveRealpath(targetPath)
  const allowedDirs: string[] = []

  // 1. Projects
  for (const project of config.projects) {
    const realProj = await realpath(project.path).catch(() => path.resolve(project.path))
    allowedDirs.push(realProj)
  }

  // 2. Targets' user skill paths
  for (const target of Object.values(config.targets)) {
    if (target.enabled && target.userSkillPath) {
      const realPath = await realpath(target.userSkillPath).catch(() => path.resolve(target.userSkillPath))
      allowedDirs.push(realPath)
    }
  }

  // 3. Backup dir
  if (config.backupDir) {
    const realBackup = await realpath(config.backupDir).catch(() => path.resolve(config.backupDir))
    allowedDirs.push(realBackup)
  }

  // 4. Rule templates dir
  if (config.ruleTemplateDir) {
    const realRules = await realpath(config.ruleTemplateDir).catch(() => path.resolve(config.ruleTemplateDir))
    allowedDirs.push(realRules)
  }

  // 5. Local library dir (inside workspace root)
  const repoRoot = process.cwd()
  const realLibrary = await realpath(path.join(repoRoot, 'library')).catch(() => path.resolve(repoRoot, 'library'))
  allowedDirs.push(realLibrary)

  // 6. Repo root itself (for config, backups, registry)
  const realRepo = await realpath(repoRoot).catch(() => repoRoot)
  allowedDirs.push(realRepo)

  // Check if target path is inside any allowed directories
  const isSafe = allowedDirs.some(parent => isPathInside(parent, resolvedTarget))

  if (!isSafe) {
    throw new AppError(
      'PATH_OUT_OF_BOUNDS',
      `Path security violation: target path is outside allowed directories: ${targetPath}`,
      { resolvedTarget, allowedDirs }
    )
  }
}

export async function assertInsideProject(projectPath: string, targetPath: string): Promise<void> {
  const [projectRoot, target] = await Promise.all([
    realpath(projectPath),
    resolveRealpath(targetPath)
  ])

  if (!isPathInside(projectRoot, target)) {
    throw new AppError(
      'PATH_OUT_OF_BOUNDS',
      `Refusing to write outside project: ${targetPath}`
    )
  }
}
