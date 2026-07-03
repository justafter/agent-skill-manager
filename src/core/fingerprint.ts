import { stat } from 'node:fs/promises'
import path from 'node:path'
import { checksumDirectory } from '../utils/hash.js'

export interface DirectoryFingerprint {
  path: string
  checksum: `sha256:${string}`
  lastModified: string
}

export async function fingerprintDirectory(targetPath: string): Promise<DirectoryFingerprint> {
  const checksum = await checksumDirectory(targetPath)
  const info = await stat(targetPath)

  return {
    path: path.resolve(targetPath),
    checksum,
    lastModified: info.mtime.toISOString()
  }
}
