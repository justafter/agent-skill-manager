import type { Adapter, AdapterTargetPaths, AgentId } from './types.js'
import { pathExists } from '../utils/fs.js'

export abstract class BaseAdapter implements Adapter {
  protected constructor(
    readonly agent: AgentId,
    private readonly paths: AdapterTargetPaths
  ) {}

  async detect(): Promise<boolean> {
    return pathExists(this.paths.userSkillPath)
  }

  getTargetPaths(): AdapterTargetPaths {
    return this.paths
  }
}
