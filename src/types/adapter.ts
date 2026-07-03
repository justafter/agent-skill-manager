export type AgentId = 'claude' | 'codex' | 'gemini'
export type Scope = 'user' | 'project'
export type TargetKey = `${AgentId}:${Scope}`

export interface AdapterTargetPaths {
  userSkillPath: string
  projectSkillPath: string
  projectRuleFile: string
}

export interface Adapter {
  readonly agent: AgentId
  detect(): Promise<boolean>
  getTargetPaths(): AdapterTargetPaths
}
