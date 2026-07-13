import type { SessionAgentId, SessionRecord } from '../types.js'

export interface SessionAdapter {
  readonly agent: SessionAgentId
  readonly version: string
  scan(sourceRoot: string): Promise<SessionRecord[]>
}
