import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ResolvedConfig } from '../types/config.js'

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

export async function loadConfig(root = process.cwd()): Promise<ResolvedConfig> {
  const raw = await readFile(path.join(root, 'skill-manager.config.json'), 'utf8')
  const parsed = configSchema.parse(JSON.parse(raw))
  return resolveConfigPaths(root, parsed)
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
  const expanded = value.replace('%USERPROFILE%', process.env.USERPROFILE ?? '')
  return path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded)
}
