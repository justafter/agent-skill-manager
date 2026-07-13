import type { SessionAgentId, SessionScanResult } from './types.js'
import { loadConfig } from '../core/config.js'
import { getSessionAdapter } from './adapters/registry.js'
import { scanArchiveManifests } from './manifest.js'
import { validateSessionConfiguration } from './config.js'

export async function scanSessions(agent: SessionAgentId, root = process.cwd()): Promise<SessionScanResult> {
  const config = await loadConfig(root)
  const sessionConfig = config.sessions.agents[agent]
  const sourceRoot = sessionConfig.root
  const archiveDir = config.sessions.archiveDir
  await validateSessionConfiguration(config)

  const [agentRecords, archiveRecords] = await Promise.all([
    sessionConfig.enabled ? getSessionAdapter(agent).scan(sourceRoot) : Promise.resolve([]),
    scanArchiveManifests(archiveDir, agent),
  ])

  const archiveBytes = archiveRecords
    .filter((record) => record.integrity !== 'invalid')
    .reduce((sum, record) => sum + record.sizeBytes, 0)
  const agentSessionIds = new Set(agentRecords.map((record) => record.id))
  const migratedBytes = archiveRecords
    .filter((record) => record.integrity !== 'invalid' && !agentSessionIds.has(record.id))
    .reduce((sum, record) => sum + record.sizeBytes, 0)

  return {
    agent,
    sourceRoot,
    archiveDir,
    agentRecords,
    archiveRecords,
    stats: {
      agentBytes: agentRecords.reduce((sum, record) => sum + record.sizeBytes, 0),
      archiveBytes,
      migratedBytes,
      agentCount: agentRecords.length,
      archiveCount: archiveRecords.length,
    },
  }
}

export async function scanAllSessions(root = process.cwd()): Promise<SessionScanResult[]> {
  return Promise.all((['claude', 'codex', 'gemini'] as const).map((agent) => scanSessions(agent, root)))
}
