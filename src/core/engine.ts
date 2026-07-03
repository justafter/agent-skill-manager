import type { ResolvedConfig } from '../types/config.js'

export interface Engine {
  config: ResolvedConfig
}

export function createEngine(config: ResolvedConfig): Engine {
  return { config }
}
