import { cp } from 'node:fs/promises'

export async function copyDirectory(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false
  })
}
