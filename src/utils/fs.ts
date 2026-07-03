import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(target: string): Promise<void> {
  await mkdir(target, { recursive: true })
}

export async function atomicWriteFile(target: string, content: string): Promise<void> {
  await ensureDir(path.dirname(target))
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, content)
  await rename(temp, target)
}

export async function atomicWriteJson(target: string, value: unknown): Promise<void> {
  await atomicWriteFile(target, `${JSON.stringify(value, null, 2)}\n`)
}
