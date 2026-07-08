import { Router } from 'express'
import path from 'node:path'
import { loadConfig, saveConfig } from '../../core/config.js'
import { loadRegistry } from '../../core/registry.js'
import { scanProject } from '../../projects/scanner.js'
import { planProjectSkillInject, applyProjectSkillInject } from '../../projects/inject.js'
import { pathExists } from '../../utils/fs.js'
import type { AgentId } from '../../types/adapter.js'
import { AppError } from '../../utils/errors.js'
import { planRuleSync } from '../../rules/plan.js'
import { applyRuleSync, crossSyncRule } from '../../rules/apply.js'
import { buildRemovePreview, removeProject } from '../../projects/remove.js'

function resolveRuleTemplateDir(config: { ruleTemplateDir: string; workspaceRoot?: string }): string {
  const raw = config.ruleTemplateDir
  if (!raw) {
    throw new AppError(
      'CONFIG_MISSING',
      'ruleTemplateDir is not configured. Set it via UI / POST /api/config/rule-template-dir ' +
        'or in ~/.skill-manager/config.json before using Rule operations.',
    )
  }
  return path.isAbsolute(raw) ? raw : path.resolve(config.workspaceRoot || process.cwd(), raw)
}

export function projectsRouter(): Router {
  const router = Router()

  // 1. GET /api/projects - List registered projects with scan details
  router.get('/', async (_req, res, next) => {
    try {
      const config = await loadConfig()
      const projectsWithScan = []

      for (const p of config.projects || []) {
        try {
          const scan = await scanProject(p)
          projectsWithScan.push({
            ...p,
            scan,
          })
        } catch {
          // If scan fails (e.g. project folder deleted), return empty scan
          projectsWithScan.push({
            ...p,
            scan: { projectId: p.id, skillDirs: [], ruleFiles: [] },
          })
        }
      }

      res.json({ projects: projectsWithScan })
    } catch (error) {
      next(error)
    }
  })

  // 2. POST /api/projects - Register a new project
  router.post('/', async (req, res, next) => {
    try {
      const { name, path: projectPath } = req.body
      if (!name || !projectPath) {
        throw new AppError('VALIDATION_ERROR', 'Project name and path are required.')
      }

      const config = await loadConfig()
      const absPath = path.resolve(projectPath)

      if (!(await pathExists(absPath))) {
        throw new AppError('VALIDATION_ERROR', `Project path does not exist: ${absPath}`)
      }

      // Check duplicates
      const duplicate = config.projects.find((p) => path.resolve(p.path) === absPath)
      if (duplicate) {
        throw new AppError('VALIDATION_ERROR', `Project is already registered with ID: ${duplicate.id}`)
      }

      const id = `proj_${Math.random().toString(36).substring(2, 10)}`

      // Detect agent directories
      const detectedAgents: AgentId[] = []
      // Note: gemini shares `.agents` with codex at the project level,
      // so we dedupe by agent (each agent appears at most once).
      const agentsToCheck: { agent: AgentId; folder: string }[] = [
        { agent: 'claude', folder: '.claude' },
        { agent: 'codex', folder: '.agents' },
        { agent: 'gemini', folder: '.agents' },
      ]
      const detectedAgentsSet = new Set<AgentId>()
      for (const check of agentsToCheck) {
        if (detectedAgentsSet.has(check.agent)) continue
        if (await pathExists(path.join(absPath, check.folder))) {
          detectedAgents.push(check.agent)
          detectedAgentsSet.add(check.agent)
        }
      }

      // Fallback
      const enabledAgents =
        detectedAgents.length > 0
          ? detectedAgents
          : (Object.keys(config.targets) as AgentId[]).filter((a) => config.targets[a]?.enabled)

      const newProject = {
        id,
        name,
        path: absPath,
        enabledAgents,
        allowProjectSkill: true,
        allowProjectRule: true,
      }

      const updatedProjects = [...config.projects, newProject]
      await saveConfig({ projects: updatedProjects })

      res.json({ project: newProject })
    } catch (error) {
      next(error)
    }
  })

  // 3. POST /api/projects/:id/inject/plan - Generate skill injection plan
  router.post('/:id/inject/plan', async (req, res, next) => {
    try {
      const { id } = req.params
      const { skillName, agent } = req.body

      if (!skillName || !agent) {
        throw new AppError('VALIDATION_ERROR', 'skillName and agent are required.')
      }

      const config = await loadConfig()
      const p = config.projects.find((proj) => proj.id === id)
      if (!p) {
        throw new AppError('NOT_FOUND', `Project not found: ${id}`)
      }

      const registry = await loadRegistry()
      const skill = registry.skills[skillName]
      if (!skill) {
        throw new AppError('NOT_FOUND', `Skill not found in local library: ${skillName}`)
      }

      const planResult = await planProjectSkillInject(p, skill, agent as AgentId)
      res.json(planResult)
    } catch (error) {
      next(error)
    }
  })

  // 4. POST /api/projects/:id/inject/apply - Apply skill injection
  router.post('/:id/inject/apply', async (req, res, next) => {
    try {
      const { id } = req.params
      const { planId, allowManagedModify } = req.body

      if (!planId) {
        throw new AppError('VALIDATION_ERROR', 'planId is required.')
      }

      const applyResult = await applyProjectSkillInject(planId, id, {
        allowManagedModify,
      })

      res.json(applyResult)
    } catch (error) {
      next(error)
    }
  })

  // 5. GET /api/projects/:id/rules/diff - Generate rules template diff
  router.get('/:id/rules/diff', async (req, res, next) => {
    try {
      const { id } = req.params
      const { agent } = req.query

      if (!agent) {
        throw new AppError('VALIDATION_ERROR', 'agent parameter is required.')
      }

      const config = await loadConfig()
      const p = config.projects.find((proj) => proj.id === id)
      if (!p) {
        throw new AppError('NOT_FOUND', `Project not found: ${id}`)
      }

      const templateDir = resolveRuleTemplateDir(config)
      const planResult = await planRuleSync(p, agent as AgentId, undefined, templateDir)
      res.json(planResult)
    } catch (error) {
      next(error)
    }
  })

  // 6. POST /api/projects/:id/rules/sync - Synchronize rules
  router.post('/:id/rules/sync', async (req, res, next) => {
    try {
      const { id } = req.params
      const { agent, mode } = req.body

      if (!agent || !mode) {
        throw new AppError('VALIDATION_ERROR', 'agent and mode are required.')
      }

      await applyRuleSync(id, agent as AgentId, mode as any, undefined, resolveRuleTemplateDir(await loadConfig()))
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  // 7. POST /api/projects/:id/rules/cross-sync - Cross-agent rule sync inside a project
  router.post('/:id/rules/cross-sync', async (req, res, next) => {
    try {
      const { id } = req.params
      const { sourceAgent, targetAgent, mode } = req.body

      if (!sourceAgent || !targetAgent || !mode) {
        throw new AppError('VALIDATION_ERROR', 'sourceAgent, targetAgent and mode are required.')
      }
      if (sourceAgent === targetAgent) {
        throw new AppError('VALIDATION_ERROR', 'sourceAgent and targetAgent must differ.')
      }

      await crossSyncRule(id, sourceAgent as AgentId, targetAgent as AgentId, mode)
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  // 8. PUT /api/projects/:id/rules/template - Bind project to a specific rule template
  router.put('/:id/rules/template', async (req, res, next) => {
    try {
      const { id } = req.params
      const { agent, templateName } = req.body

      if (!agent || templateName === undefined) {
        throw new AppError('VALIDATION_ERROR', 'agent and templateName are required.')
      }

      const config = await loadConfig()
      const projects = config.projects || []
      const projectIdx = projects.findIndex((p) => p.id === id)
      if (projectIdx === -1) {
        throw new AppError('NOT_FOUND', `Project not found: ${id}`)
      }

      const project = projects[projectIdx]
      const ruleTemplates = { ...(project.ruleTemplates || {}) }

      if (templateName === null || templateName === '') {
        delete ruleTemplates[agent as AgentId]
      } else {
        ruleTemplates[agent as AgentId] = templateName
      }

      const updatedProject = {
        ...project,
        ruleTemplates,
      }

      const updatedProjects = [...projects]
      updatedProjects[projectIdx] = updatedProject

      await saveConfig({ projects: updatedProjects })
      res.json({ success: true, project: updatedProject })
    } catch (error) {
      next(error)
    }
  })

  // 9. GET /api/projects/:id/remove-preview - Build removal impact preview (read-only).
  router.get('/:id/remove-preview', async (req, res, next) => {
    try {
      const { id } = req.params
      const config = await loadConfig()
      const target = (config.projects ?? []).find((p) => p.id === id)
      if (!target) {
        throw new AppError('NOT_FOUND', `Project not found: ${id}`)
      }
      const preview = await buildRemovePreview(target)
      res.json(preview)
    } catch (error) {
      next(error)
    }
  })

  // 10. DELETE /api/projects/:id - Remove project from config (no files deleted).
  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params
      const confirmed = req.body?.confirmed === true
      const result = await removeProject(id, confirmed)
      res.json({
        success: true,
        projects: result.projects,
        backupPath: result.backupPath,
      })
    } catch (error) {
      next(error)
    }
  })

  // 11. POST /api/projects/:id/scan - Re-scan a single project's directories
  // (added 2026-07-08 to back the "重新扫描" button in ProjectWorkspacePage).
  router.post('/:id/scan', async (req, res, next) => {
    try {
      const { id } = req.params
      const config = await loadConfig()
      const target = (config.projects ?? []).find((p) => p.id === id)
      if (!target) {
        throw new AppError('NOT_FOUND', `Project not found: ${id}`)
      }

      let scan: { projectId: string; skillDirs: string[]; ruleFiles: string[] }
      try {
        scan = await scanProject(target)
      } catch {
        // Mirror GET /api/projects behaviour: project dir missing / unreadable
        // → return empty scan instead of 500.
        scan = { projectId: target.id, skillDirs: [], ruleFiles: [] }
      }

      res.json({ ...scan, scannedAt: new Date().toISOString() })
    } catch (error) {
      next(error)
    }
  })

  return router
}
