import type { SkillState } from '../types/skill.js'
import { parseSkillDir } from '../validation/skill.js'
import { pathExists } from '../utils/fs.js'

export type DevelopmentSkillStatus = 'identical' | 'changed' | 'missing' | 'invalid'

export interface DevelopmentSkillState {
  status: DevelopmentSkillStatus
  localPath: string
  checksum?: `sha256:${string}`
  lastModified?: string
  error?: string
}

export async function scanDevelopmentSkill(skill: SkillState): Promise<DevelopmentSkillState> {
  const localPath = skill.localPath

  if (!localPath || !(await pathExists(localPath))) {
    return {
      status: 'missing',
      localPath
    }
  }

  try {
    const meta = await parseSkillDir(localPath)
    return {
      status: meta.checksum === skill.checksum ? 'identical' : 'changed',
      localPath,
      checksum: meta.checksum,
      lastModified: meta.lastModified
    }
  } catch (error) {
    return {
      status: 'invalid',
      localPath,
      error: (error as Error).message
    }
  }
}

export async function scanDevelopmentSkills(
  skills: SkillState[]
): Promise<Record<string, DevelopmentSkillState>> {
  const result: Record<string, DevelopmentSkillState> = {}

  for (const skill of skills) {
    result[skill.name] = await scanDevelopmentSkill(skill)
  }

  return result
}
