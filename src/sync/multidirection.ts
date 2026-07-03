import type { SkillState } from '../types/skill.js'

export function findLatestSkillSource(states: SkillState[]): SkillState | undefined {
  return [...states].sort((a, b) => b.lastModified.localeCompare(a.lastModified))[0]
}
