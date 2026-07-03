import { realpath } from 'node:fs/promises'
import { isPathInside } from '../utils/paths.js'

export async function assertInsideProject(projectPath: string, targetPath: string): Promise<void> {
  const [projectRoot, target] = await Promise.all([
    realpath(projectPath),
    realpath(targetPath).catch(() => targetPath)
  ])

  if (!isPathInside(projectRoot, target)) {
    throw new Error(`Refusing to write outside project: ${targetPath}`)
  }
}
