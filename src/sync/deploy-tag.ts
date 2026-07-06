import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { DeployTag } from '../types/adapter.js'
import { atomicWriteJson, pathExists } from '../utils/fs.js'

export async function readDeployTag(targetDir: string): Promise<DeployTag | undefined> {
  const tagPath = path.join(targetDir, '.skill-manager-deploy.json')
  if (!(await pathExists(tagPath))) {
    return undefined
  }
  try {
    const raw = await readFile(tagPath, 'utf8')
    const tag = JSON.parse(raw) as DeployTag
    if (tag && tag.managedBy === 'AgentSkillManager' && tag.skillName) {
      return tag
    }
    return undefined
  } catch {
    return undefined
  }
}

export async function writeDeployTag(targetDir: string, tag: DeployTag): Promise<void> {
  await atomicWriteJson(path.join(targetDir, '.skill-manager-deploy.json'), tag)
}
