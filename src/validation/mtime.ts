import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export async function collectLastModified(root: string): Promise<string> {
  const values = await collectMtimes(root)
  const latest = Math.max(...values, 0)
  return new Date(latest).toISOString()
}

async function collectMtimes(root: string): Promise<number[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const values: number[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) {
      values.push(...(await collectMtimes(absolute)))
    } else if (entry.isFile()) {
      values.push((await stat(absolute)).mtimeMs)
    }
  }

  return values
}
