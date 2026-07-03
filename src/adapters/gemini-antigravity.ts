import type { AdapterTargetPaths } from './types.js'
import { BaseAdapter } from './base.js'

export class GeminiAntigravityAdapter extends BaseAdapter {
  constructor(paths: AdapterTargetPaths) {
    super('gemini', paths)
  }
}
