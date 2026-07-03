import type { AgentId } from './adapter.js'

export interface Project {
  id: string
  name: string
  path: string
  enabledAgents: AgentId[]
  allowProjectSkill: boolean
  allowProjectRule: boolean
}

export interface ProjectConfig {
  projects: Project[]
}
