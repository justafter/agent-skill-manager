import type { AgentId } from '../types/adapter.js'

export type SessionAgentId = AgentId
export type SessionLocation = 'agent' | 'archive'
export type SessionKind = 'transcript' | 'session-bundle' | 'artifact-only'
export type SessionActivity = 'idle' | 'busy' | 'unknown'
export type SessionIntegrity = 'unchecked' | 'valid' | 'invalid'
export type SessionEntryType = 'file' | 'directory'
export type SessionAction = 'migrate' | 'restore'

export interface SessionEntry {
  absolutePath: string
  relativePath: string
  type: SessionEntryType
}

export interface SessionRecord {
  id: string
  agent: SessionAgentId
  location: SessionLocation
  kind: SessionKind
  title?: string
  workspacePath?: string
  createdAt?: string
  updatedAt: string
  sizeBytes: number
  fileCount: number
  sourceRoot: string
  entries: SessionEntry[]
  activity: SessionActivity
  integrity: SessionIntegrity
  warnings: string[]
  archiveBundlePath?: string
}

export interface ArchiveManifestEntry {
  originalRelativePath: string
  payloadRelativePath: string
  type: SessionEntryType
}

export interface ArchiveManifest {
  schemaVersion: 1
  archiveId: string
  agent: SessionAgentId
  sessionId: string
  kind: SessionKind
  title?: string
  workspacePath?: string
  originalRoot: string
  originalPath: string
  entries: ArchiveManifestEntry[]
  fileCount: number
  sizeBytes: number
  checksum: `sha256:${string}`
  createdAt?: string
  updatedAt: string
  archivedAt: string
  adapterVersion: string
}

export type SessionPlanItemStatus = 'ready' | 'conflict' | 'busy' | 'invalid'

export interface SessionPlanItem {
  sessionId: string
  agent: SessionAgentId
  action: SessionAction
  status: SessionPlanItemStatus
  sourceRoot: string
  sourceEntries: SessionEntry[]
  targetPath: string
  sizeBytes: number
  fileCount: number
  expectedChecksum?: `sha256:${string}`
  record: SessionRecord
  manifest?: ArchiveManifest
  reason?: string
  warnings: string[]
}

export interface SessionOperationPlan {
  planId: `spl_${string}`
  action: SessionAction
  agent: SessionAgentId
  createdAt: string
  items: SessionPlanItem[]
  executedAt?: string
}

export interface SessionPlanResult {
  plan: SessionOperationPlan
  summary: Record<SessionPlanItemStatus, number>
}

export type SessionOperationState =
  | 'planned'
  | 'copying'
  | 'verified'
  | 'committed'
  | 'completed'
  | 'cleanupPending'
  | 'failed'

export interface SessionOperationItemLog {
  sessionId: string
  state: SessionOperationState
  sourcePaths: string[]
  targetPath: string
  updatedAt: string
  error?: { code: string; message: string }
}

export interface SessionOperationLog {
  operationId: string
  planId: string
  action: SessionAction
  agent: SessionAgentId
  createdAt: string
  updatedAt: string
  items: SessionOperationItemLog[]
}

export interface SessionApplyItemResult {
  sessionId: string
  state: SessionOperationState
  error?: { code: string; message: string }
}

export interface SessionApplyResult {
  planId: string
  operationId: string
  action: SessionAction
  items: SessionApplyItemResult[]
}

export interface SessionStats {
  agentBytes: number
  archiveBytes: number
  migratedBytes: number
  agentCount: number
  archiveCount: number
}

export interface SessionScanResult {
  agent: SessionAgentId
  sourceRoot: string
  archiveDir: string
  agentRecords: SessionRecord[]
  archiveRecords: SessionRecord[]
  stats: SessionStats
}

export type SessionMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface SessionMessage {
  id: string
  role: SessionMessageRole
  content: string
  timestamp?: string
  kind?: string
  truncated?: boolean
}

export interface SessionConversation {
  sessionId: string
  agent: SessionAgentId
  location: SessionLocation
  messages: SessionMessage[]
  truncated: boolean
  warnings: string[]
}
