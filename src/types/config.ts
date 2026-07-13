import type { Project } from './project.js'
import type { AgentId } from './adapter.js'

export interface TargetConfig {
  enabled: boolean
  userSkillPath: string
  projectSkillPath: string
  projectRuleFile: string
}

export interface ServerConfig {
  host: string
  port: number
}

export interface SessionAgentConfig {
  enabled: boolean
  root: string
}

export interface SessionManagementConfig {
  archiveDir: string
  agents: Record<AgentId, SessionAgentConfig>
}

export interface AppConfig {
  backupDir: string
  devDir: string
  ruleTemplateDir: string
  server: ServerConfig
  targets: Record<AgentId, TargetConfig>
  sessions: SessionManagementConfig
  projects: Project[]
}

export type ResolvedConfig = AppConfig & { workspaceRoot?: string }
