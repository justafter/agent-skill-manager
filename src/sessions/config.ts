import path from 'node:path'
import type { ResolvedConfig } from '../types/config.js'
import type { SessionAgentId } from './types.js'
import { loadConfig, saveConfig } from '../core/config.js'
import { expandUserProfile, isPathInside } from '../utils/paths.js'
import { resolveRealpath } from '../projects/guard.js'
import { AppError } from '../utils/errors.js'

export function getSessionSourceRoot(config: ResolvedConfig, agent: SessionAgentId): string {
  return config.sessions.agents[agent].root
}

export async function validateSessionConfiguration(config: ResolvedConfig): Promise<void> {
  if (!config.sessions.archiveDir) return
  const archiveRoot = await resolveRealpath(config.sessions.archiveDir)
  for (const [agent, agentConfig] of Object.entries(config.sessions.agents)) {
    if (!agentConfig.enabled || !agentConfig.root) continue
    const sourceRoot = await resolveRealpath(agentConfig.root)
    if (isPathInside(sourceRoot, archiveRoot) || isPathInside(archiveRoot, sourceRoot)) {
      throw new AppError(
        'SESSION_CONFIG_CONFLICT',
        `Session archive directory and ${agent} source root must not contain each other.`,
        { archiveRoot, sourceRoot, agent },
      )
    }
  }
}

export async function updateSessionArchiveDir(value: string, root = process.cwd()): Promise<ResolvedConfig> {
  const trimmed = value.trim()
  if (!trimmed) {
    await saveConfig({ sessions: { archiveDir: '' } })
    return loadConfig(root)
  }
  const expanded = expandUserProfile(trimmed)
  if (!path.isAbsolute(expanded)) {
    throw new AppError('VALIDATION_ERROR', 'Session archive directory must be an absolute path.')
  }
  const current = await loadConfig(root)
  const candidate: ResolvedConfig = {
    ...current,
    sessions: {
      ...current.sessions,
      archiveDir: path.normalize(expanded),
    },
  }
  await validateSessionConfiguration(candidate)
  await saveConfig({ sessions: { archiveDir: path.normalize(expanded) } })
  return loadConfig(root)
}
