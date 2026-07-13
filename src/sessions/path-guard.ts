import path from 'node:path'
import type { SessionAgentId, SessionEntry } from './types.js'
import { fromPortableRelative, isSafeRelativePath, toPortableRelative, UUID_PATTERN } from './utils.js'
import { isPathInside } from '../utils/paths.js'
import { resolveRealpath } from '../projects/guard.js'
import { AppError } from '../utils/errors.js'

export async function assertSessionEntriesSafe(
  agent: SessionAgentId,
  sourceRoot: string,
  entries: SessionEntry[],
): Promise<void> {
  const resolvedRoot = await resolveRealpath(sourceRoot)
  for (const entry of entries) {
    const portable = toPortableRelative(entry.relativePath)
    if (!isSafeRelativePath(portable) || !isAllowedAgentEntry(agent, portable, entry.type)) {
      throw new AppError('PATH_OUT_OF_BOUNDS', `Unsafe ${agent} session path: ${entry.relativePath}`)
    }
    const expected = path.resolve(sourceRoot, fromPortableRelative(portable))
    if (path.resolve(expected) !== path.resolve(entry.absolutePath)) {
      throw new AppError('PATH_OUT_OF_BOUNDS', `Session entry does not match its configured root: ${entry.absolutePath}`)
    }
    const resolvedEntry = await resolveRealpath(entry.absolutePath)
    if (!isPathInside(resolvedRoot, resolvedEntry)) {
      throw new AppError('PATH_OUT_OF_BOUNDS', `Session entry escapes its configured root: ${entry.absolutePath}`)
    }
  }
}

export async function assertArchivePathSafe(archiveDir: string, targetPath: string): Promise<void> {
  if (!archiveDir) throw new AppError('SESSION_ARCHIVE_NOT_CONFIGURED', 'Session archive directory is not configured.')
  const [archiveRoot, target] = await Promise.all([resolveRealpath(archiveDir), resolveRealpath(targetPath)])
  if (!isPathInside(archiveRoot, target)) {
    throw new AppError('PATH_OUT_OF_BOUNDS', `Archive path escapes the configured archive directory: ${targetPath}`)
  }
}

function isAllowedAgentEntry(
  agent: SessionAgentId,
  relativePath: string,
  entryType: SessionEntry['type'],
): boolean {
  const parts = fromPortableRelative(relativePath).split(path.sep).filter(Boolean)
  if (agent === 'claude') {
    if (parts.length !== 3 || parts[0] !== 'projects') return false
    const leaf = parts[2]
    return entryType === 'file'
      ? path.extname(leaf).toLowerCase() === '.jsonl' && UUID_PATTERN.test(path.basename(leaf, '.jsonl'))
      : UUID_PATTERN.test(leaf)
  }
  if (agent === 'codex') {
    if (entryType !== 'file' || !['sessions', 'archived_sessions'].includes(parts[0])) return false
    if (parts[0] === 'sessions' && !/^\d{4}$/.test(parts[1] ?? '')) return false
    if (parts[0] === 'sessions' && !/^\d{2}$/.test(parts[2] ?? '')) return false
    if (parts[0] === 'sessions' && !/^\d{2}$/.test(parts[3] ?? '')) return false
    if (parts[0] === 'sessions' && parts.length !== 5) return false
    if (parts[0] === 'archived_sessions' && parts.length !== 2) return false
    const fileName = parts.at(-1) ?? ''
    if (!fileName.startsWith('rollout-')) return false
    const match = fileName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i)
    return match ? UUID_PATTERN.test(match[1]) : false
  }
  return entryType === 'directory' && parts.length === 1 && UUID_PATTERN.test(parts[0])
}
