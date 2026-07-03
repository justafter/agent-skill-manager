import { readFile, unlink, writeFile } from 'node:fs/promises'

export async function writePidFile(path: string, pid = process.pid): Promise<void> {
  await writeFile(path, `${pid}\n`)
}

export async function readPidFile(path: string): Promise<number | null> {
  try {
    const value = await readFile(path, 'utf8')
    const pid = Number.parseInt(value.trim(), 10)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

export async function removePidFile(path: string): Promise<void> {
  await unlink(path).catch(() => undefined)
}
