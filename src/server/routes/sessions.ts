import { Router } from 'express'
import { z } from 'zod'
import type { SessionAgentId } from '../../sessions/types.js'
import { scanAllSessions, scanSessions } from '../../sessions/scan.js'
import { createMigratePlan, createRestorePlan } from '../../sessions/plan.js'
import { applySessionPlan } from '../../sessions/apply.js'
import { updateSessionArchiveDir } from '../../sessions/config.js'
import { listOperationLogs } from '../../sessions/operation-journal.js'
import { loadConfig } from '../../core/config.js'
import { loadSessionConversation } from '../../sessions/conversation.js'

const agentSchema = z.enum(['claude', 'codex', 'gemini'])
const planSchema = z.object({
  agent: agentSchema,
  sessionIds: z.array(z.string().min(1)).min(1),
})
const applySchema = z.object({ planId: z.string().startsWith('spl_') })
const configSchema = z.object({ archiveDir: z.string() })
const locationSchema = z.enum(['agent', 'archive'])

export function sessionsRouter(): Router {
  const router = Router()

  router.get('/', async (req, res, next) => {
    try {
      const agentValue = req.query.agent
      if (agentValue === undefined) {
        res.json({ agents: await scanAllSessions(process.cwd()) })
        return
      }
      const agent = agentSchema.parse(String(agentValue)) as SessionAgentId
      res.json(await scanSessions(agent, process.cwd()))
    } catch (error) {
      next(error)
    }
  })

  router.get('/stats', async (req, res, next) => {
    try {
      const agent = agentSchema.parse(String(req.query.agent || '')) as SessionAgentId
      const result = await scanSessions(agent, process.cwd())
      res.json(result.stats)
    } catch (error) {
      next(error)
    }
  })

  router.get('/:agent/:location/:sessionId/messages', async (req, res, next) => {
    try {
      const agent = agentSchema.parse(req.params.agent) as SessionAgentId
      const location = locationSchema.parse(req.params.location)
      const sessionId = z.string().uuid().parse(req.params.sessionId)
      res.json(await loadSessionConversation(agent, location, sessionId, process.cwd()))
    } catch (error) {
      next(error)
    }
  })

  router.put('/config', async (req, res, next) => {
    try {
      const input = configSchema.parse(req.body)
      const config = await updateSessionArchiveDir(input.archiveDir, process.cwd())
      res.json({ sessions: config.sessions })
    } catch (error) {
      next(error)
    }
  })

  router.post('/migrate/plan', async (req, res, next) => {
    try {
      const input = planSchema.parse(req.body)
      res.json(await createMigratePlan(input.agent, input.sessionIds, process.cwd()))
    } catch (error) {
      next(error)
    }
  })

  router.post('/migrate/apply', async (req, res, next) => {
    try {
      const input = applySchema.parse(req.body)
      res.json(await applySessionPlan(input.planId, process.cwd()))
    } catch (error) {
      next(error)
    }
  })

  router.post('/restore/plan', async (req, res, next) => {
    try {
      const input = planSchema.parse(req.body)
      res.json(await createRestorePlan(input.agent, input.sessionIds, process.cwd()))
    } catch (error) {
      next(error)
    }
  })

  router.post('/restore/apply', async (req, res, next) => {
    try {
      const input = applySchema.parse(req.body)
      res.json(await applySessionPlan(input.planId, process.cwd()))
    } catch (error) {
      next(error)
    }
  })

  router.get('/operations', async (_req, res, next) => {
    try {
      const config = await loadConfig(process.cwd())
      res.json({ operations: await listOperationLogs(config.sessions.archiveDir) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
