import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export async function sha256File(filePath: string): Promise<`sha256:${string}`> {
  const content = await readFile(filePath)
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export async function checksumDirectory(root: string): Promise<`sha256:${string}`> {
  const entries = await collectFiles(root)
  const hash = createHash('sha256')

  for (const file of entries.sort()) {
    const absolute = path.join(root, file)
    const fileHash = await sha256File(absolute)
    hash.update(file)
    hash.update('\0')
    hash.update(fileHash)
    hash.update('\n')
  }

  return `sha256:${hash.digest('hex')}`
}

async function collectFiles(root: string, base = ''): Promise<string[]> {
  const dir = path.join(root, base)
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const relative = path.join(base, entry.name)
    const absolute = path.join(root, relative)

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relative)))
    } else if (entry.isFile()) {
      const info = await stat(absolute)
      if (info.size >= 0) files.push(relative.split(path.sep).join('/'))
    }
  }

  return files
}
