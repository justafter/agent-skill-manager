import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { isPathInside } from '../utils/paths.js'
import { pathExists } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'
import type { ResolvedConfig } from '../types/config.js'
import { getUserConfigPath } from '../core/config.js'

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
  const allowedExactPaths: string[] = []

  // 1. Projects
  for (const project of config.projects) {
    allowedDirs.push(await resolveRealpath(project.path))
  }

  // 2. Targets' user skill paths
  for (const target of Object.values(config.targets)) {
    if (target.enabled && target.userSkillPath) {
      allowedDirs.push(await resolveRealpath(target.userSkillPath))
    }
  }

  // 3. Backup dir
  if (config.backupDir) {
    allowedDirs.push(await resolveRealpath(config.backupDir))
  }

  // 4. Rule templates dir
  if (config.ruleTemplateDir) {
    allowedDirs.push(await resolveRealpath(config.ruleTemplateDir))
  }

  // 5. Managed local library paths (inside workspace root)
  const repoRoot = config.workspaceRoot ?? process.cwd()
  allowedDirs.push(await resolveRealpath(path.join(repoRoot, 'library', 'skills')))

  const registryPath = path.join(repoRoot, 'library', 'registry.json')
  const realRegistry = await resolveRealpath(registryPath)
  allowedExactPaths.push(realRegistry)

  // 6. User configuration directory ~/.skill-manager
  const userConfigDir = path.dirname(getUserConfigPath())
  allowedDirs.push(await resolveRealpath(userConfigDir))

  // Check if target path is inside any allowed directories
  const isSafe =
    allowedDirs.some((parent) => isPathInside(parent, resolvedTarget)) ||
    allowedExactPaths.some((allowedPath) => path.resolve(allowedPath) === path.resolve(resolvedTarget))

  if (!isSafe) {
    throw new AppError(
      'PATH_OUT_OF_BOUNDS',
      `Path security violation: target path is outside allowed directories: ${targetPath}`,
      { resolvedTarget, allowedDirs, allowedExactPaths },
    )
  }
}

export async function assertInsideProject(projectPath: string, targetPath: string): Promise<void> {
  const [projectRoot, target] = await Promise.all([realpath(projectPath), resolveRealpath(targetPath)])

  if (!isPathInside(projectRoot, target)) {
    throw new AppError('PATH_OUT_OF_BOUNDS', `Refusing to write outside project: ${targetPath}`)
  }
}
