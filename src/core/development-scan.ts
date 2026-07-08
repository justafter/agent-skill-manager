import path from 'node:path'
import type { SkillState } from '../types/skill.js'
import { parseSkillDir } from '../validation/skill.js'
import { pathExists } from '../utils/fs.js'
import { checksumDirectory } from '../utils/hash.js'

export type DevelopmentSkillStatus = 'identical' | 'changed' | 'missing' | 'invalid'

export interface DevelopmentSkillState {
  status: DevelopmentSkillStatus
  localPath: string
  checksum?: `sha256:${string}`
  libraryChecksum?: `sha256:${string}`
  lastModified?: string
  error?: string
}

export async function scanDevelopmentSkill(skill: SkillState, root = process.cwd()): Promise<DevelopmentSkillState> {
  const localPath = skill.localPath

  if (!localPath || !(await pathExists(localPath))) {
    return {
      status: 'missing',
      localPath,
    }
  }

  try {
    const meta = await parseSkillDir(localPath)
    const localLibraryDir = path.join(root, 'library', 'skills', skill.name)
    const libraryChecksum = (await pathExists(localLibraryDir))
      ? await checksumDirectory(localLibraryDir)
      : skill.checksum

    return {
      status: meta.checksum === libraryChecksum ? 'identical' : 'changed',
      localPath,
      checksum: meta.checksum,
      libraryChecksum,
      lastModified: meta.lastModified,
    }
  } catch (error) {
    return {
      status: 'invalid',
      localPath,
      error: (error as Error).message,
    }
  }
}

export async function scanDevelopmentSkills(
  skills: SkillState[],
  root = process.cwd(),
): Promise<Record<string, DevelopmentSkillState>> {
  const result: Record<string, DevelopmentSkillState> = {}

  for (const skill of skills) {
    result[skill.name] = await scanDevelopmentSkill(skill, root)
  }

  return result
}
