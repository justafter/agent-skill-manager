import type { TargetKey } from './adapter.js'

export type BackupItemType = 'skill' | 'rule' | 'registry'

export interface BackupItem {
  type: BackupItemType
  target?: TargetKey
  projectId?: string
  skillName?: string
  originalPath: string
  backupPath: string
  targetType?: 'user' | 'project' | 'development'
  targetAgent?: string
  targetSkillPath?: string
}

export interface BackupIndex {
  backupId: string
  createdAt: string
  reason: string
  items: BackupItem[]
}
