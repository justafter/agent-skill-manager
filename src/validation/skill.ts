import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillMeta } from '../types/skill.js'
import { pathExists } from '../utils/fs.js'
import { checksumDirectory } from './hash.js'
import { collectLastModified } from './mtime.js'
import { parseSkillFrontmatter } from './frontmatter.js'

export async function parseSkillDir(localPath: string): Promise<SkillMeta> {
  const skillFile = path.join(localPath, 'SKILL.md')
  if (!(await pathExists(skillFile))) {
    throw new Error(`Missing SKILL.md: ${localPath}`)
  }

  const frontmatter = parseSkillFrontmatter(await readFile(skillFile, 'utf8'))
  if (!frontmatter.name) throw new Error('SKILL.md frontmatter requires name')
  if (!frontmatter.description) throw new Error('SKILL.md frontmatter requires description')

  const dirName = path.basename(localPath)
  if (frontmatter.name !== dirName) {
    throw new Error(`Skill name must match directory name: ${frontmatter.name} !== ${dirName}`)
  }

  return {
    name: frontmatter.name,
    version: frontmatter.version ?? '0.0.0',
    description: frontmatter.description,
    localPath,
    checksum: await checksumDirectory(localPath),
    hasScripts: await pathExists(path.join(localPath, 'scripts')),
    hasReferences: await pathExists(path.join(localPath, 'references')),
    hasAssets: await pathExists(path.join(localPath, 'assets')),
    lastModified: await collectLastModified(localPath),
  }
}
