import express from 'express'
import { backupRouter } from './routes/backup.js'
import { configRouter } from './routes/config.js'
import { diffRouter } from './routes/diff.js'
import { healthRouter } from './routes/health.js'
import { importRouter } from './routes/import.js'
import { projectsRouter } from './routes/projects.js'
import { restoreRouter } from './routes/restore.js'
import { scanRouter } from './routes/scan.js'
import { skillsRouter } from './routes/skills.js'
import { syncRouter } from './routes/sync.js'
import { watchRouter } from './routes/watch.js'

export function createApp(): express.Express {
  const app = express()
  app.use(express.json())

  app.use('/api/health', healthRouter())
  app.use('/api/config', configRouter())
  app.use('/api/skills', skillsRouter())
  app.use('/api/scan', scanRouter())
  app.use('/api/import', importRouter())
  app.use('/api/sync', syncRouter())
  app.use('/api/diff', diffRouter())
  app.use('/api/backups', backupRouter())
  app.use('/api/restore', restoreRouter())
  app.use('/api/watch', watchRouter())
  app.use('/api/projects', projectsRouter())

  return app
}
