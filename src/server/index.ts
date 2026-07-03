import { loadConfig } from '../core/config.js'
import { logger } from '../utils/logger.js'
import { createApp } from './app.js'

const config = await loadConfig()
const app = createApp()

app.listen(config.server.port, config.server.host, () => {
  logger.info({ server: config.server }, 'Agent Skill Manager API started')
})
