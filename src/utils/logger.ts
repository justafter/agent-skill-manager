import pino from 'pino'

export const logger = pino({
  name: 'agent-skill-manager',
  level: process.env.ASM_LOG_LEVEL ?? 'info'
})
