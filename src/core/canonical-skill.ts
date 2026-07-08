import path from 'node:path'
import type { SkillState } from '../types/skill.js'
import { pathExists } from '../utils/fs.js'
import { checksumDirectory } from '../utils/hash.js'

export async function resolveCanonicalSkillState(skill: SkillState, root = process.cwd()): Promise<SkillState> {
  const skillDir = path.join(root, 'library', 'skills', skill.name)
  if (!(await pathExists(skillDir))) {
    return skill
  }

  return {
    ...skill,
    checksum: await checksumDirectory(skillDir),
  }
}

export async function resolveCanonicalSkillStates(skills: SkillState[], root = process.cwd()): Promise<SkillState[]> {
  const result: SkillState[] = []
  for (const skill of skills) {
    result.push(await resolveCanonicalSkillState(skill, root))
  }
  return result
}
