import type { SessionAgentId } from '../types.js'
import type { SessionAdapter } from './types.js'
import { ClaudeSessionAdapter } from './claude.js'
import { CodexSessionAdapter } from './codex.js'
import { GeminiSessionAdapter } from './gemini.js'

const adapters: Record<SessionAgentId, SessionAdapter> = {
  claude: new ClaudeSessionAdapter(),
  codex: new CodexSessionAdapter(),
  gemini: new GeminiSessionAdapter(),
}

export function getSessionAdapter(agent: SessionAgentId): SessionAdapter {
  return adapters[agent]
}
