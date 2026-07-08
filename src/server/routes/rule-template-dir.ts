import { Router } from 'express'
import path from 'node:path'
import { loadConfig, saveConfig } from '../../core/config.js'
import { pathExists } from '../../utils/fs.js'
import { AppError } from '../../utils/errors.js'

/**
 * Routes for managing the rule template directory (cfg.ruleTemplateDir).
 *
 * The directory is the root that holds `<agent>/<file-name>` templates (e.g.
 * `claude/CLAUDE.md`). Read/write go through user-level config
 * (~/.skill-manager/config.json) via `saveConfig` so they survive server restarts.
 */
export function ruleTemplateDirRouter(): Router {
  const router = Router()

  // GET /api/config/rule-template-dir - Return the configured template dir (resolved to absolute).
  router.get('/', async (_req, res, next) => {
    try {
      const config = await loadConfig()
      const raw = config.ruleTemplateDir
      const absolute = !raw
        ? null
        : path.isAbsolute(raw)
          ? raw
          : path.resolve(config.workspaceRoot || process.cwd(), raw)

      res.json({
        raw: raw || null,
        absolute,
        missing: absolute ? !(await pathExists(absolute)) : true,
      })
    } catch (error) {
      next(error)
    }
  })

  // PUT /api/config/rule-template-dir - Update the template dir.
  router.put('/', async (req, res, next) => {
    try {
      const next = String(req.body?.path ?? '').trim()
      if (!next) {
        throw new AppError('VALIDATION_ERROR', 'path is required.')
      }
      // Accept absolute or workspace-relative paths; refuse directory traversal tokens.
      if (next.includes('..')) {
        throw new AppError('VALIDATION_ERROR', 'path must not contain "..".')
      }

      const config = await loadConfig()
      const absolute = path.isAbsolute(next) ? next : path.resolve(config.workspaceRoot || process.cwd(), next)

      // Auto-create the directory if it doesn't exist (so the UI can switch
      // before the user has written any templates).
      if (!(await pathExists(absolute))) {
        const fs = await import('node:fs/promises')
        await fs.mkdir(absolute, { recursive: true })
      }

      await saveConfig({ ruleTemplateDir: absolute })

      res.json({
        raw: absolute,
        absolute,
        missing: false,
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
