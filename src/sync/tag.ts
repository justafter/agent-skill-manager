import path from 'node:path'
import type { TargetKey } from '../types/adapter.js'
import { atomicWriteJson } from '../utils/fs.js'

export interface DeployTag {
  managedBy: 'AgentSkillManager'
  skillName: string
  sourcePath: string
  sourceHash: string
  target: TargetKey
  projectId?: string
  deployedAt: string
}

export async function writeDeployTag(targetDir: string, tag: DeployTag): Promise<void> {
  await atomicWriteJson(path.join(targetDir, '.skill-manager-deploy.json'), tag)
}
