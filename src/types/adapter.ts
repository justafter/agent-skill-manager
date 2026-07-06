export type AgentId = 'claude' | 'codex' | 'gemini'
export type Scope = 'user' | 'project'
export type TargetKey = `${AgentId}:${Scope}`

export interface AdapterTargetPaths {
  userSkillPath: string
  projectSkillPath: string
  projectRuleFile: string
}

export interface DeployTag {
  managedBy: 'AgentSkillManager'
  skillName: string
  sourcePath: string
  sourceHash: string
  target: TargetKey
  projectId?: string
  deployedAt: string
}

export interface TargetSkillInfo {
  name: string
  localPath: string
  checksum: `sha256:${string}`
  deployTag?: DeployTag
  detected: boolean
}

export interface Adapter {
  readonly agent: AgentId
  detect(): Promise<boolean>
  getTargetPaths(): AdapterTargetPaths
  scanUserSkills(): Promise<Record<string, TargetSkillInfo>>
}
