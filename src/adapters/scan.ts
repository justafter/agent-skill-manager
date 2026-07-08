import type { TargetSkillInfo } from './types.js'
import type { SkillState } from '../types/skill.js'

export type SkillSyncStatus = 'identical' | 'missing' | 'changed' | 'conflict'

export function identifySkillState(
  source: SkillState | undefined,
  target: TargetSkillInfo | undefined,
): SkillSyncStatus {
  if (!target || !target.detected) {
    return 'missing'
  }
  if (!source) {
    return 'conflict'
  }
  if (source.checksum === target.checksum) {
    return 'identical'
  }
  if (target.deployTag && target.deployTag.managedBy === 'AgentSkillManager') {
    return 'changed'
  }
  return 'conflict'
}
