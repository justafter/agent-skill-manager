import matter from 'gray-matter'

export interface SkillFrontmatter {
  name?: string
  version?: string
  description?: string
}

export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  return matter(content).data as SkillFrontmatter
}
