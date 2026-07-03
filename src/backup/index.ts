import { readFile } from 'node:fs/promises'
import type { BackupIndex } from '../types/backup.js'

export async function readBackupIndex(path: string): Promise<BackupIndex> {
  return JSON.parse(await readFile(path, 'utf8')) as BackupIndex
}
