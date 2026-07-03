import type { AdapterTargetPaths } from './types.js'
import { BaseAdapter } from './base.js'

export class ClaudeAdapter extends BaseAdapter {
  constructor(paths: AdapterTargetPaths) {
    super('claude', paths)
  }
}
