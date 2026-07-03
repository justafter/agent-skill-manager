import type { AdapterTargetPaths } from './types.js'
import { BaseAdapter } from './base.js'

export class CodexAdapter extends BaseAdapter {
  constructor(paths: AdapterTargetPaths) {
    super('codex', paths)
  }
}
