import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

const KNOWN_HTTP_STATUS: Record<string, number> = {
  PATH_OUT_OF_BOUNDS: 403,
  BACKUP_NOT_FOUND: 404,
  SKILL_NOT_FOUND: 404,
  PLAN_NOT_FOUND: 404,
  PLAN_ALREADY_EXECUTED: 409,
  SKILL_SOURCE_MISSING: 500,
  INVALID_TARGET_KEY: 400,
  INVALID_TARGET_AGENT: 400,
  UNSUPPORTED_SCOPE: 400,
  TARGET_REFUSED: 400,
  INCONSISTENT_OPTIONS: 400,
  AGENT_DISABLED: 400,
  VALIDATION_ERROR: 400,
  PULL_VALIDATION_FAILED: 400,
  BACKUP_FAILED: 500,
  REGISTRY_SAVE_FAILED: 500,
  REGISTRY_LOAD_FAILED: 500,
  CONFIG_LOAD_FAILED: 500,
  CONFIG_PARSE_ERROR: 500,
  CONFIG_VALIDATION_FAILED: 500,
  CONFIG_SAVE_FAILED: 500,
  CONFIG_SNAPSHOT_FAILED: 500,
  CONFIRMATION_REQUIRED: 400,
  SKILL_ALREADY_EXISTS: 409,
  NOT_FOUND: 404,
}

const FALLBACK_STATUS = 500

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // express requires 4-arg signature even when next is unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const status = KNOWN_HTTP_STATUS[err.code] ?? FALLBACK_STATUS
    res.status(status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    })
    return
  }

  logger.error({ err }, 'Unhandled error in server middleware')
  res.status(FALLBACK_STATUS).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  })
}
