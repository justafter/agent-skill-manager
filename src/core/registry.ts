import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillRegistry } from '../types/skill.js'
import { pathExists, atomicWriteJson } from '../utils/fs.js'
import { AppError } from '../utils/errors.js'

export async function loadRegistry(root = process.cwd()): Promise<SkillRegistry> {
  const registryPath = path.join(root, 'library', 'registry.json')
  if (!(await pathExists(registryPath))) {
    return {
      version: 1,
      skills: {}
    }
  }

  try {
    const raw = await readFile(registryPath, 'utf8')
    return JSON.parse(raw) as SkillRegistry
  } catch (error) {
    throw new AppError(
      'REGISTRY_LOAD_FAILED',
      `Failed to load registry: ${(error as Error).message}`,
      { registryPath, originalError: error }
    )
  }
}

export async function saveRegistry(registry: SkillRegistry, root = process.cwd()): Promise<void> {
  const registryPath = path.join(root, 'library', 'registry.json')
  try {
    await atomicWriteJson(registryPath, registry)
  } catch (error) {
    throw new AppError(
      'REGISTRY_SAVE_FAILED',
      `Failed to save registry: ${(error as Error).message}`,
      { registryPath, originalError: error }
    )
  }
}
