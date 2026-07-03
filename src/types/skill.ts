import type { TargetKey } from './adapter.js'

export interface SkillMeta {
  name: string
  version: string
  description: string
  localPath: string
  checksum: `sha256:${string}`
  hasScripts: boolean
  hasReferences: boolean
  hasAssets: boolean
  lastModified: string
}

export interface ProjectInstall {
  projectId: string
  target: TargetKey
  checksum: `sha256:${string}`
  deployedAt: string
}

export interface SkillState extends SkillMeta {
  syncedTargets: TargetKey[]
  projectInstalls: ProjectInstall[]
}

export interface SkillRegistry {
  version: number
  skills: Record<string, SkillState>
}
