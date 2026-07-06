import { Router } from 'express'
import path from 'node:path'
import { loadConfig, saveConfig } from '../../core/config.js'
import { loadRegistry } from '../../core/registry.js'
import { scanProject } from '../../projects/scanner.js'
import { planProjectSkillInject, applyProjectSkillInject } from '../../projects/inject.js'
import { pathExists } from '../../utils/fs.js'
import type { AgentId } from '../../types/adapter.js'
import { AppError } from '../../utils/errors.js'

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
            scan
          })
        } catch {
          // If scan fails (e.g. project folder deleted), return empty scan
          projectsWithScan.push({
            ...p,
            scan: { projectId: p.id, skillDirs: [], ruleFiles: [] }
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
      const agentsToCheck: { agent: AgentId; folder: string }[] = [
        { agent: 'claude', folder: '.claude' },
        { agent: 'codex', folder: '.agents' },
        { agent: 'gemini', folder: '.gemini' }
      ]

      for (const check of agentsToCheck) {
        if (await pathExists(path.join(absPath, check.folder))) {
          detectedAgents.push(check.agent)
        }
      }

      // Fallback
      const enabledAgents = detectedAgents.length > 0
        ? detectedAgents
        : (Object.keys(config.targets) as AgentId[]).filter((a) => config.targets[a]?.enabled)

      const newProject = {
        id,
        name,
        path: absPath,
        enabledAgents,
        allowProjectSkill: true,
        allowProjectRule: true
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
        allowManagedModify
      })

      res.json(applyResult)
    } catch (error) {
      next(error)
    }
  })

  return router
}