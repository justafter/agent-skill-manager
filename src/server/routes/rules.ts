import { Router } from 'express'
import path from 'node:path'
import { loadConfig } from '../../core/config.js'
import { scanProject } from '../../projects/scanner.js'
import { planRuleSync } from '../../rules/plan.js'
import { listRuleTemplates } from '../../rules/template.js'
import { AppError } from '../../utils/errors.js'
import { pathExists, ensureDir } from '../../utils/fs.js'
import { writeFile } from 'node:fs/promises'
import type { AgentId } from '../../types/adapter.js'

const ruleFileByAgent: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
}

function resolveTemplateDir(config: { ruleTemplateDir: string; workspaceRoot?: string }): string {
  const raw = config.ruleTemplateDir
  if (!raw) {
    throw new AppError(
      'CONFIG_MISSING',
      'ruleTemplateDir is not configured. Set it via `asm config set ruleTemplateDir <path>`, ' +
        'POST /api/config/rule-template-dir, or in ~/.skill-manager/config.json before using Rule operations.',
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
      const agents: AgentId[] = ['claude', 'codex', 'gemini']
      const rules = []

      for (const agent of agents) {
        const defaultFileName = ruleFileByAgent[agent]
        let fileNames = await listRuleTemplates(templateDir, agent)

        // Ensure default file name is in the list
        if (!fileNames.includes(defaultFileName)) {
          fileNames.unshift(defaultFileName)
        }

        for (const fileName of fileNames) {
          const templatePath = path.join(templateDir, agent, fileName)
          const templateExists = await pathExists(templatePath)

          // Find projects bound to this specific template
          const installedPaths = []
          for (const p of projects) {
            const projectTemplate = p.ruleTemplates?.[agent]
            const isBound = projectTemplate === fileName

            if (isBound) {
              const projectRulePath = path.join(p.path, defaultFileName)
              let exists = false
              try {
                const scan = await scanProject(p)
                exists = scan.ruleFiles.some(
                  (f) =>
                    f.endsWith(defaultFileName) || f === projectRulePath || f === path.join(p.path, defaultFileName),
                )
              } catch {
                exists = false
              }
              installedPaths.push({
                projectId: p.id,
                projectName: p.name,
                path: projectRulePath,
                exists,
              })
            }
          }

          rules.push({
            agent,
            name: fileName,
            localPath: templatePath,
            templateDir,
            templateExists,
            installedPaths,
          })
        }
      }

      res.json({ rules })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/rules - Create a new empty rule template file
  router.post('/', async (req, res, next) => {
    try {
      const { agent, name } = req.body
      if (!agent || !name) {
        throw new AppError('VALIDATION_ERROR', 'agent and name are required.')
      }
      if (!name.endsWith('.md')) {
        throw new AppError('VALIDATION_ERROR', 'Template file name must end with .md')
      }
      const config = await loadConfig()
      const templateDir = resolveTemplateDir(config)
      const templatePath = path.join(templateDir, agent, name)

      if (await pathExists(templatePath)) {
        throw new AppError('VALIDATION_ERROR', `Template already exists at: ${templatePath}`)
      }

      await ensureDir(path.dirname(templatePath))
      const initialContent = `<!-- BEGIN AgentSkillManager:${agent} -->\n# Custom Rules for ${agent.toUpperCase()}\n\nAdd your custom rules here.\n<!-- END AgentSkillManager:${agent} -->\n`
      await writeFile(templatePath, initialContent, 'utf8')

      res.json({ success: true, path: templatePath })
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
