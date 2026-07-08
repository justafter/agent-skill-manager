import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Project } from '../types/project.js'
import type { AgentId } from '../types/adapter.js'
import type { SkillRegistry } from '../types/skill.js'
import { AppError } from '../utils/errors.js'
import { ensureDir, pathExists } from '../utils/fs.js'
import { getUserConfigPath } from '../core/config.js'
import { loadConfig, saveConfig } from '../core/config.js'
import { loadRegistry } from '../core/registry.js'
import { assertSafeWritePath } from './guard.js'

/**
 * Preview data for a project removal: lists files that THIS TOOL has written
 * or managed under the given project. It does NOT enumerate files outside the
 * tool's knowledge (e.g. user-authored CLAUDE.md with no managed block).
 *
 * Per spec: removal MUST NOT delete any of these files; they remain on disk,
 * simply de-listed from this manager.
 */
export interface RemovePreviewSkillInstall {
  /** Skill name as registered in `library/skills/<name>`. */
  skill: string
  /** Agent that the skill was injected for. */
  agent: AgentId
  /** Resolved absolute path: `<project.path>/<targets[agent].projectSkillPath>/<skill>`. */
  absolutePath: string
  /** Whether the directory currently exists on disk. */
  exists: boolean
}

export interface RemovePreviewRuleFile {
  agent: AgentId
  /** File name, e.g. `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`. */
  file: string
  absolutePath: string
  exists: boolean
}

export interface RemovePreview {
  project: { id: string; name: string; path: string }
  skillInstalls: RemovePreviewSkillInstall[]
  ruleFiles: RemovePreviewRuleFile[]
}

export interface RemoveProjectResult {
  /** Projects list after removal. */
  projects: Project[]
  /** Absolute path to the config snapshot taken before the removal. */
  backupPath: string
}

/**
 * Build the preview for removing a project. Read-only.
 *
 * - `skillInstalls` is sourced from `library/registry.json`'s `projectInstalls`.
 *   For each entry whose `projectId === project.id`, we resolve the absolute
 *   path via `config.targets[agent].projectSkillPath` and check existence.
 * - `ruleFiles` is computed by checking the project's expected rule file
 *   locations for each enabled agent (mirrors D8 scan semantics).
 */
export async function buildRemovePreview(project: Project): Promise<RemovePreview> {
  const config = await loadConfig()
  const agentConfigFor = (agent: AgentId) => config.targets[agent]

  // 1. Skill installs from registry.
  const registry = await loadRegistry()
  const skillInstalls: RemovePreviewSkillInstall[] = []
  for (const [skillName, state] of Object.entries(registry.skills ?? {})) {
    for (const install of state.projectInstalls ?? []) {
      if (install.projectId !== project.id) continue
      // projectId-targeted installs are always project scope; the agent
      // comes from the TargetKey's left half.
      const [agentRaw] = install.target.split(':') as [AgentId, string]
      const agent = agentRaw
      const agentCfg = agentConfigFor(agent)
      if (!agentCfg) continue
      const absolutePath = path.join(project.path, agentCfg.projectSkillPath, skillName)
      skillInstalls.push({
        skill: skillName,
        agent,
        absolutePath,
        exists: await pathExists(absolutePath),
      })
    }
  }

  // 2. Rule files: probe per enabled agent.
  const ruleFiles: RemovePreviewRuleFile[] = []
  for (const agent of project.enabledAgents ?? []) {
    const agentCfg = agentConfigFor(agent)
    if (!agentCfg) continue
    const file = agentCfg.projectRuleFile
    if (!file) continue
    const absolutePath = path.join(project.path, file)
    ruleFiles.push({
      agent,
      file: path.basename(file),
      absolutePath,
      exists: await pathExists(absolutePath),
    })
  }

  return {
    project: { id: project.id, name: project.name, path: project.path },
    skillInstalls,
    ruleFiles,
  }
}

/**
 * Remove a project from the user-level configuration.
 *
 * Strict invariants:
 * - Only mutates `config.json`. NEVER deletes any file under `project.path`.
 * - Takes a snapshot of the current `config.json` before writing the new one.
 *   If the snapshot fails, no write is attempted.
 * - If `saveConfig` fails, the snapshot remains on disk and the original
 *   `config.json` is untouched (single-file atomic write via rename).
 * - Requires `confirmed === true`; otherwise raises `CONFIRMATION_REQUIRED`
 *   and does nothing.
 *
 * Errors:
 * - `NOT_FOUND` if `projectId` does not exist in the project list.
 * - `VALIDATION_ERROR` if `projectId` is empty.
 * - `CONFIRMATION_REQUIRED` if `confirmed` is not strictly `true`.
 * - `CONFIG_SNAPSHOT_FAILED` if the snapshot cannot be written.
 * - `CONFIG_SAVE_FAILED` if the new config cannot be written (propagated
 *   from `saveConfig`; snapshot path included in details for recovery).
 */
export async function removeProject(projectId: string, confirmed: boolean): Promise<RemoveProjectResult> {
  if (confirmed !== true) {
    throw new AppError('CONFIRMATION_REQUIRED', 'Removal requires explicit confirmation (confirmed=true).', {
      projectId,
    })
  }
  if (!projectId || typeof projectId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'projectId is required.', { projectId })
  }

  const config = await loadConfig()
  const existing = config.projects ?? []
  const idx = existing.findIndex((p) => p.id === projectId)
  if (idx === -1) {
    throw new AppError('NOT_FOUND', `Project not found: ${projectId}`, { projectId })
  }
  const target = existing[idx]

  // Step 1: snapshot current config.json. If this fails, abort without writing.
  const backupPath = await snapshotUserConfig(`remove-project-${projectId}`)

  // Step 2: write the new projects list (full-array replacement, mirroring
  // the existing PUT /rules/template pattern).
  const nextProjects = [...existing.slice(0, idx), ...existing.slice(idx + 1)]
  try {
    await saveConfig({ projects: nextProjects })
  } catch (error) {
    // Re-throw with the snapshot path so callers can offer rollback.
    if (error instanceof AppError && error.code === 'CONFIG_SAVE_FAILED') {
      throw new AppError('CONFIG_SAVE_FAILED', error.message, {
        ...((error.details as object | undefined) ?? {}),
        snapshot: backupPath,
        originalProjects: existing,
      })
    }
    throw error
  }

  return { projects: nextProjects, backupPath }
}

/**
 * Take a verbatim copy of the current user config to
 * `<configDir>/backups/config-snapshots/<prefix>-<ISO-timestamp>.json`.
 *
 * The snapshot uses raw byte copy to preserve formatting (no JSON re-serialize).
 */
async function snapshotUserConfig(prefix: string): Promise<string> {
  const configPath = getUserConfigPath()
  const configDir = path.dirname(configPath)
  const snapshotDir = path.join(configDir, 'backups', 'config-snapshots')

  // Defensive: ensure the snapshot dir is inside an allowed boundary.
  // `getUserConfigPath` resolves under %USERPROFILE%/.skill-manager which is
  // already allowlisted by `assertSafeWritePath`, so this is a sanity guard,
  // not a security boundary.
  await assertSafeWritePath(snapshotDir, await loadConfig())

  try {
    await ensureDir(snapshotDir)
  } catch (error) {
    throw new AppError('CONFIG_SNAPSHOT_FAILED', `Failed to prepare snapshot directory: ${(error as Error).message}`, {
      snapshotDir,
      originalError: error,
    })
  }

  const ts = new Date().toISOString().replace(/:/g, '-')
  const snapshotPath = path.join(snapshotDir, `${prefix}-${ts}.json`)

  if (!(await pathExists(configPath))) {
    // No prior user config — snapshot a fresh empty object to make restores deterministic.
    try {
      await writeFile(snapshotPath, '{}\n', 'utf8')
    } catch (error) {
      throw new AppError(
        'CONFIG_SNAPSHOT_FAILED',
        `Failed to write empty config snapshot: ${(error as Error).message}`,
        { snapshotPath, originalError: error },
      )
    }
    return snapshotPath
  }

  try {
    await copyFile(configPath, snapshotPath)
  } catch (error) {
    throw new AppError('CONFIG_SNAPSHOT_FAILED', `Failed to snapshot config.json: ${(error as Error).message}`, {
      snapshotPath,
      sourcePath: configPath,
      originalError: error,
    })
  }

  return snapshotPath
}
