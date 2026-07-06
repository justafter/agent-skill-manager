import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ResolvedConfig } from '../types/config.js'
import { expandUserProfile } from '../utils/paths.js'
import { pathExists, atomicWriteJson, atomicWriteFile } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'

const targetSchema = z.object({
  enabled: z.boolean(),
  userSkillPath: z.string(),
  projectSkillPath: z.string(),
  projectRuleFile: z.string()
})

const configSchema = z.object({
  backupDir: z.string(),
  devDir: z.string(),
  ruleTemplateDir: z.string(),
  server: z.object({
    host: z.string(),
    port: z.number().int().positive()
  }),
  targets: z.object({
    claude: targetSchema,
    codex: targetSchema,
    gemini: targetSchema
  }),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      enabledAgents: z.array(z.enum(['claude', 'codex', 'gemini'])),
      allowProjectSkill: z.boolean().default(true),
      allowProjectRule: z.boolean().default(true)
    })
  )
})

export function getUserConfigPath(): string {
  return expandUserProfile('%USERPROFILE%/.skill-manager/config.json')
}

export function getOldUserConfigPath(): string {
  return expandUserProfile('%USERPROFILE%/.skill-manager.config.json')
}

export function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null || typeof source !== 'object' || source === null) {
    return source !== undefined ? source : target
  }

  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue
    if (Array.isArray(target[key]) || Array.isArray(source[key])) {
      result[key] = source[key]
    } else if (typeof target[key] === 'object' && target[key] !== null && typeof source[key] === 'object' && source[key] !== null) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export async function loadConfig(root = process.cwd()): Promise<ResolvedConfig> {
  const defaultPath = path.join(root, 'skill-manager.config.json')
  let defaultJson: any = {}
  try {
    const raw = await readFile(defaultPath, 'utf8')
    defaultJson = JSON.parse(raw)
  } catch (error) {
    throw new AppError(
      'CONFIG_LOAD_FAILED',
      `Default configuration file not found at ${defaultPath}`,
      { defaultPath, originalError: error }
    )
  }

  const userPath = getUserConfigPath()
  const oldUserPath = getOldUserConfigPath()

  // Migrate user config if old path exists but new path doesn't
  if (!(await pathExists(userPath)) && (await pathExists(oldUserPath))) {
    try {
      const oldRaw = await readFile(oldUserPath, 'utf8')
      await atomicWriteFile(userPath, oldRaw)
      await unlink(oldUserPath).catch(() => {})
    } catch (migrationError) {
      // Continue and let it fail or log on parse if it failed to write
    }
  }

  let userJson: any = {}
  if (await pathExists(userPath)) {
    try {
      const raw = await readFile(userPath, 'utf8')
      userJson = JSON.parse(raw)
    } catch (error) {
      throw new AppError(
        'CONFIG_PARSE_ERROR',
        `Failed to parse user configuration at ${userPath}: ${(error as Error).message}`,
        { userPath, originalError: error }
      )
    }
  }

  const merged = deepMerge(defaultJson, userJson)
  try {
    const parsed = configSchema.parse(merged)
    const resolved = resolveConfigPaths(root, parsed)
    return {
      ...resolved,
      workspaceRoot: root
    }
  } catch (error) {
    throw new AppError(
      'CONFIG_VALIDATION_FAILED',
      `Configuration validation failed: ${(error as Error).message}`,
      { merged, originalError: error }
    )
  }
}

export async function saveConfig(userConfigUpdates: Partial<ResolvedConfig>): Promise<void> {
  const userPath = getUserConfigPath()
  let existingUserConfig: any = {}
  if (await pathExists(userPath)) {
    try {
      const raw = await readFile(userPath, 'utf8')
      existingUserConfig = JSON.parse(raw)
    } catch {
      existingUserConfig = {}
    }
  }

  const updatedUserConfig = deepMerge(existingUserConfig, userConfigUpdates)
  try {
    await atomicWriteJson(userPath, updatedUserConfig)
  } catch (error) {
    throw new AppError(
      'CONFIG_SAVE_FAILED',
      `Failed to save user configuration: ${(error as Error).message}`,
      { userPath, originalError: error }
    )
  }
}

function resolveConfigPaths(root: string, config: ResolvedConfig): ResolvedConfig {
  return {
    ...config,
    backupDir: resolveTokenPath(root, config.backupDir),
    ruleTemplateDir: resolveTokenPath(root, config.ruleTemplateDir),
    targets: {
      claude: {
        ...config.targets.claude,
        userSkillPath: resolveTokenPath(root, config.targets.claude.userSkillPath)
      },
      codex: {
        ...config.targets.codex,
        userSkillPath: resolveTokenPath(root, config.targets.codex.userSkillPath)
      },
      gemini: {
        ...config.targets.gemini,
        userSkillPath: resolveTokenPath(root, config.targets.gemini.userSkillPath)
      }
    }
  }
}

function resolveTokenPath(root: string, value: string): string {
  if (!value) return value
  const expanded = expandUserProfile(value)
  return path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded)
}
