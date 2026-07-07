import { writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { expandUserProfile } from './paths.js'
import { ensureDir } from './fs.js'

export function getPidPath(name: string): string {
  return expandUserProfile(`%USERPROFILE%/.skill-manager/run/${name}.pid`)
}

export async function writePidFile(name: string, pid: number): Promise<void> {
  const file = getPidPath(name)
  await ensureDir(path.dirname(file))
  await writeFile(file, String(pid), 'utf8')
}

export async function deletePidFile(name: string): Promise<void> {
  const file = getPidPath(name)
  try {
    await unlink(file)
  } catch {}
}
