import { Router } from 'express'
import path from 'node:path'
import { loadConfig } from '../../core/config.js'
import { scanProject } from '../../projects/scanner.js'
import { planRuleSync } from '../../rules/plan.js'
import { AppError } from '../../utils/errors.js'
import { pathExists } from '../../utils/fs.js'
import type { AgentId } from '../../types/adapter.js'

const ruleFileByAgent: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md'
}

function resolveTemplateDir(config: { ruleTemplateDir: string; workspaceRoot?: string }): string {
  const raw = config.ruleTemplateDir
  if (!raw) {
    throw new AppError(
      'CONFIG_MISSING',
      'ruleTemplateDir is not configured. Set it via `asm config set ruleTemplateDir <path>`, ' +
        'POST /api/config/rule-template-dir, or in ~/.skill-manager/config.json before using Rule operations.'
    )
  }
  if (path.isAbsolute(raw)) return raw
  const root = config.workspaceRoot || process.cwd()
  return path.resolve(root, raw)
}

export function rulesRouter(): Router {
  const router = Router()

  // GET /api/rules - List all rule templates with per-project installed paths.
  router.get('/', async (_req, res, next) => {
    try {
      const config = await loadConfig()
      const templateDir = resolveTemplateDir(config)
      const projects = config.projects || []

      // Build per-agent template entries + installedPaths across all registered projects.
      const agents: AgentId[] = ['claude', 'codex', 'gemini']
      const rules = []

      for (const agent of agents) {
        const fileName = ruleFileByAgent[agent]
        const templatePath = path.join(templateDir, agent, fileName)

        // Resolve installed paths for every registered project (regardless of enabledAgents).
        // For each project, the project-level path is <project.path>/<fileName>.
        const installedPaths: { projectId: string; projectName: string; path: string; exists: boolean }[] = []
        for (const p of projects) {
          const projectRulePath = path.join(p.path, fileName)
          let exists = false
          try {
            const scan = await scanProject(p)
            exists = scan.ruleFiles.some((f) => f.endsWith(fileName) || f === projectRulePath || f === path.join(p.path, fileName))
          } catch {
            exists = false
          }
          installedPaths.push({
            projectId: p.id,
            projectName: p.name,
            path: projectRulePath,
            exists
          })
        }

        // Verify the user-configured template dir exists on disk; mark missing so the UI can warn.
        const templateExists = await pathExists(templatePath)

        rules.push({
          agent,
          name: fileName,
          localPath: templatePath,
          templateDir,
          templateExists,
          installedPaths
        })
      }

      res.json({ rules })
    } catch (error) {
      next(error)
    }
  })

  // GET /api/rules/diff?projectId=<id>&agent=<agent> - reuse planRuleSync
  router.get('/diff', async (req, res, next) => {
    try {
      const projectId = String(req.query.projectId || '')
      const agent = String(req.query.agent || '') as AgentId
      if (!projectId || !agent) {
        throw new AppError('VALIDATION_ERROR', 'projectId and agent are required.')
      }
      const config = await loadConfig()
      const project = config.projects.find((p) => p.id === projectId)
      if (!project) {
        throw new AppError('NOT_FOUND', `Project not found: ${projectId}`)
      }
      const templateDir = resolveTemplateDir(config)
      const plan = await planRuleSync(project, agent, undefined, templateDir)
      res.json(plan)
    } catch (error) {
      next(error)
    }
  })

  return router
}