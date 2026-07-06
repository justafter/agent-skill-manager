import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { pathExists } from '../utils/fs.js'

export function diffText(fromName: string, toName: string, before: string, after: string): string {
  return createTwoFilesPatch(fromName, toName, before, after)
}

export interface DiffFileEntry {
  path: string
  status: 'added' | 'removed' | 'changed'
  patch?: string
}

export async function diffDirectories(
  sourceDir: string,
  targetDir: string
): Promise<{ files: DiffFileEntry[] }> {
  const collectRelativeFiles = async (dir: string, base = ''): Promise<string[]> => {
    const fullDir = path.join(dir, base)
    if (!(await pathExists(fullDir))) return []
    const entries = await readdir(fullDir, { withFileTypes: true }).catch(() => [])
    const files: string[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules') continue
      const relative = path.join(base, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await collectRelativeFiles(dir, relative)))
      } else if (entry.isFile()) {
        files.push(relative.split(path.sep).join('/'))
      }
    }
    return files
  }

  const sourceFiles = await collectRelativeFiles(sourceDir)
  const targetFiles = await collectRelativeFiles(targetDir)

  const allFiles = Array.from(new Set([...sourceFiles, ...targetFiles])).sort()
  const result: DiffFileEntry[] = []

  for (const file of allFiles) {
    const sourceFilePath = path.join(sourceDir, file)
    const targetFilePath = path.join(targetDir, file)

    const sourceExists = await pathExists(sourceFilePath)
    const targetExists = await pathExists(targetFilePath)

    if (sourceExists && !targetExists) {
      result.push({
        path: file,
        status: 'added'
      })
    } else if (!sourceExists && targetExists) {
      result.push({
        path: file,
        status: 'removed'
      })
    } else {
      const sourceContent = await readFile(sourceFilePath, 'utf8')
      const targetContent = await readFile(targetFilePath, 'utf8')

      if (sourceContent !== targetContent) {
        const patch = createTwoFilesPatch(
          `target/${file}`,
          `source/${file}`,
          targetContent,
          sourceContent
        )
        result.push({
          path: file,
          status: 'changed',
          patch
        })
      }
    }
  }

  return { files: result }
}
