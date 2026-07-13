import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { SessionEntry } from './types.js'
import { AppError } from '../utils/errors.js'

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface TreeNode {
  absolutePath: string
  relativePath: string
  type: 'file' | 'directory'
  size: number
  birthtimeMs: number
  mtimeMs: number
}

export interface SessionEntrySnapshot {
  fileCount: number
  sizeBytes: number
  createdAt?: string
  updatedAt: string
  latestMtimeMs: number
  filePaths: string[]
}

export function toPortableRelative(value: string): string {
  return value.split(path.sep).join('/')
}

export function fromPortableRelative(value: string): string {
  return value.split('/').join(path.sep)
}

export function isSafeRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value)) return false
  const normalized = path.normalize(fromPortableRelative(value))
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`) && !path.isAbsolute(normalized)
}

export async function snapshotSessionEntries(entries: SessionEntry[]): Promise<SessionEntrySnapshot> {
  const nodes = await collectEntryNodes(entries)
  const files = nodes.filter((node) => node.type === 'file')
  const times = nodes.map((node) => node.mtimeMs)
  const births = nodes.map((node) => node.birthtimeMs).filter((value) => value > 0)
  const latestMtimeMs = times.length > 0 ? Math.max(...times) : 0
  const earliestBirthtimeMs = births.length > 0 ? Math.min(...births) : 0

  return {
    fileCount: files.length,
    sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
    createdAt: earliestBirthtimeMs > 0 ? new Date(earliestBirthtimeMs).toISOString() : undefined,
    updatedAt: new Date(latestMtimeMs || Date.now()).toISOString(),
    latestMtimeMs,
    filePaths: files.map((file) => file.absolutePath),
  }
}

export async function checksumSessionEntries(entries: SessionEntry[]): Promise<`sha256:${string}`> {
  const nodes = (await collectEntryNodes(entries)).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  const hash = createHash('sha256')

  for (const node of nodes) {
    hash.update(node.type)
    hash.update('\0')
    hash.update(node.relativePath)
    hash.update('\0')
    if (node.type === 'file') {
      hash.update(await sha256FileStreaming(node.absolutePath))
    }
    hash.update('\n')
  }

  return `sha256:${hash.digest('hex')}`
}

export async function listSessionFiles(entries: SessionEntry[]): Promise<string[]> {
  const nodes = await collectEntryNodes(entries)
  return nodes.filter((node) => node.type === 'file').map((node) => node.absolutePath)
}

async function collectEntryNodes(entries: SessionEntry[]): Promise<TreeNode[]> {
  const nodes: TreeNode[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (!isSafeRelativePath(toPortableRelative(entry.relativePath))) {
      throw new AppError('PATH_OUT_OF_BOUNDS', `Unsafe session relative path: ${entry.relativePath}`)
    }
    const prefix = toPortableRelative(entry.relativePath)
    await collectPath(entry.absolutePath, prefix, nodes, seen)
  }

  return nodes
}

async function collectPath(
  absolutePath: string,
  relativePath: string,
  nodes: TreeNode[],
  seen: Set<string>,
): Promise<void> {
  const info = await lstat(absolutePath)
  if (info.isSymbolicLink()) {
    throw new AppError('SESSION_SYMLINK_UNSUPPORTED', `Session payload contains a symbolic link: ${absolutePath}`)
  }
  if (!info.isFile() && !info.isDirectory()) {
    throw new AppError('SESSION_ENTRY_UNSUPPORTED', `Unsupported session entry type: ${absolutePath}`)
  }

  const portable = toPortableRelative(relativePath)
  const key = `${info.isDirectory() ? 'd' : 'f'}:${portable}`
  if (seen.has(key)) return
  seen.add(key)
  nodes.push({
    absolutePath,
    relativePath: portable,
    type: info.isDirectory() ? 'directory' : 'file',
    size: info.isFile() ? info.size : 0,
    birthtimeMs: info.birthtimeMs,
    mtimeMs: info.mtimeMs,
  })

  if (!info.isDirectory()) return
  const children = await readdir(absolutePath, { withFileTypes: true })
  for (const child of children) {
    await collectPath(path.join(absolutePath, child.name), path.join(relativePath, child.name), nodes, seen)
  }
}

function sha256FileStreaming(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function activityFromTimestamp(updatedAt: string, active = false): 'idle' | 'busy' | 'unknown' {
  if (active) return 'busy'
  const updatedMs = Date.parse(updatedAt)
  if (Number.isFinite(updatedMs) && Date.now() - updatedMs < 60_000) return 'unknown'
  return 'idle'
}

export function normalizeTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.slice(0, 160)
}
