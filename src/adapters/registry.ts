import type { Adapter, AgentId } from './types.js'
import type { ResolvedConfig } from '../types/config.js'
import { ClaudeAdapter } from './claude.js'
import { CodexAdapter } from './codex.js'
import { GeminiAntigravityAdapter } from './gemini-antigravity.js'

export function createAdapters(config: ResolvedConfig): Record<AgentId, Adapter> {
  return {
    claude: new ClaudeAdapter(config.targets.claude),
    codex: new CodexAdapter(config.targets.codex),
    gemini: new GeminiAntigravityAdapter(config.targets.gemini),
  }
}
