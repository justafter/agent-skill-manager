import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ArchiveManifest, SessionAgentId, SessionRecord } from './types.js'
import { atomicWriteJson, pathExists } from '../utils/fs.js'
import { fromPortableRelative, isSafeRelativePath, UUID_PATTERN } from './utils.js'

const manifestEntrySchema = z.object({
  originalRelativePath: z.string(),
  payloadRelativePath: z.string(),
  type: z.enum(['file', 'directory']),
})

const archiveManifestSchema = z.object({
  schemaVersion: z.literal(1),
  archiveId: z.string(),
  agent: z.enum(['claude', 'codex', 'gemini']),
  sessionId: z.string(),
  kind: z.enum(['transcript', 'session-bundle', 'artifact-only']),
  title: z.string().optional(),
  workspacePath: z.string().optional(),
  originalRoot: z.string(),
  originalPath: z.string(),
  entries: z.array(manifestEntrySchema).min(1),
  fileCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/) as z.ZodType<`sha256:${string}`>,
  createdAt: z.string().optional(),
  updatedAt: z.string(),
  archivedAt: z.string(),
  adapterVersion: z.string(),
})

export async function writeArchiveManifest(bundlePath: string, manifest: ArchiveManifest): Promise<void> {
  await atomicWriteJson(path.join(bundlePath, 'manifest.json'), manifest)
}

export async function readArchiveManifest(manifestPath: string): Promise<ArchiveManifest> {
  const raw = await readFile(manifestPath, 'utf8')
  const manifest = archiveManifestSchema.parse(JSON.parse(raw))
  if (!UUID_PATTERN.test(manifest.sessionId)) {
    throw new Error(`Invalid session ID in manifest: ${manifest.sessionId}`)
  }
  for (const entry of manifest.entries) {
    if (!isSafeRelativePath(entry.originalRelativePath) || !isSafeRelativePath(entry.payloadRelativePath)) {
      throw new Error(`Unsafe relative path in manifest for ${manifest.sessionId}`)
    }
  }
  return manifest
}

export async function scanArchiveManifests(archiveDir: string, agent: SessionAgentId): Promise<SessionRecord[]> {
  if (!archiveDir) return []
  const agentDir = path.join(archiveDir, 'sessions', agent)
  if (!(await pathExists(agentDir))) return []
  const bundles = await readdir(agentDir, { withFileTypes: true }).catch(() => [])
  const records: SessionRecord[] = []

  for (const bundle of bundles) {
    if (!bundle.isDirectory() || !UUID_PATTERN.test(bundle.name)) continue
    const bundlePath = path.join(agentDir, bundle.name)
    const manifestPath = path.join(bundlePath, 'manifest.json')
    try {
      const manifest = await readArchiveManifest(manifestPath)
      if (manifest.agent !== agent || manifest.sessionId !== bundle.name) {
        throw new Error('Manifest identity does not match archive directory')
      }
      const payloadRoot = path.join(bundlePath, 'payload')
      const entries = manifest.entries.map((entry) => ({
        absolutePath: path.join(payloadRoot, fromPortableRelative(entry.payloadRelativePath)),
        relativePath: entry.originalRelativePath,
        type: entry.type,
      }))
      const payloadExists = await Promise.all(entries.map((entry) => pathExists(entry.absolutePath)))
      records.push({
        id: manifest.sessionId,
        agent,
        location: 'archive',
        kind: manifest.kind,
        title: manifest.title,
        workspacePath: manifest.workspacePath,
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
        sizeBytes: manifest.sizeBytes,
        fileCount: manifest.fileCount,
        sourceRoot: payloadRoot,
        entries,
        activity: 'idle',
        integrity: payloadExists.every(Boolean) ? 'unchecked' : 'invalid',
        warnings: payloadExists.every(Boolean) ? [] : ['归档 payload 缺少 manifest 声明的文件或目录。'],
        archiveBundlePath: bundlePath,
      })
    } catch (error) {
      records.push({
        id: bundle.name,
        agent,
        location: 'archive',
        kind: 'transcript',
        updatedAt: new Date(0).toISOString(),
        sizeBytes: 0,
        fileCount: 0,
        sourceRoot: bundlePath,
        entries: [],
        activity: 'idle',
        integrity: 'invalid',
        warnings: [`归档 manifest 无效：${(error as Error).message}`],
        archiveBundlePath: bundlePath,
      })
    }
  }

  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function findManifestForRecord(record: SessionRecord): Promise<ArchiveManifest> {
  if (!record.archiveBundlePath) throw new Error(`Archive bundle path is missing for ${record.id}`)
  return readArchiveManifest(path.join(record.archiveBundlePath, 'manifest.json'))
}
