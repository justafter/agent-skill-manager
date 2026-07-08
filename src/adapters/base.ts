import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { Adapter, AdapterTargetPaths, AgentId, TargetSkillInfo } from './types.js'
import { pathExists } from '../utils/fs.js'
import { checksumDirectory } from '../utils/hash.js'
import { readDeployTag } from '../sync/deploy-tag.js'

export abstract class BaseAdapter implements Adapter {
  protected constructor(
    readonly agent: AgentId,
    private readonly paths: AdapterTargetPaths,
  ) {}

  async detect(): Promise<boolean> {
    return pathExists(this.paths.userSkillPath)
  }

  getTargetPaths(): AdapterTargetPaths {
    return this.paths
  }

  async scanUserSkills(): Promise<Record<string, TargetSkillInfo>> {
    const userPath = this.paths.userSkillPath
    if (!userPath || !(await pathExists(userPath))) {
      return {}
    }

    try {
      const entries = await readdir(userPath, { withFileTypes: true }).catch(() => [])
      const results: Record<string, TargetSkillInfo> = {}

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillName = entry.name
          const skillDir = path.join(userPath, skillName)

          if (await pathExists(path.join(skillDir, 'SKILL.md'))) {
            const checksum = await checksumDirectory(skillDir)
            const deployTag = await readDeployTag(skillDir)
            results[skillName] = {
              name: skillName,
              localPath: skillDir,
              checksum,
              deployTag,
              detected: true,
            }
          }
        }
      }

      return results
    } catch {
      return {}
    }
  }
}
