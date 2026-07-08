import assert from 'node:assert/strict'
import { describe, it, before, after, beforeEach } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig, saveConfig } from '../../src/core/config.js'
import { scanProject } from '../../src/projects/scanner.js'
import { pathExists } from '../../src/utils/fs.js'
import { buildRemovePreview, removeProject } from '../../src/projects/remove.js'
import { AppError } from '../../src/utils/errors.js'

const BASE_CONFIG = {
  backupDir: './backups',
  devDir: '',
  ruleTemplateDir: './library/rules',
  server: { host: '127.0.0.1', port: 47821 },
  targets: {
    claude: { enabled: true, userSkillPath: '', projectSkillPath: '.claude/skills', projectRuleFile: 'CLAUDE.md' },
    codex: { enabled: true, userSkillPath: '', projectSkillPath: '.agents/skills', projectRuleFile: 'AGENTS.md' },
    gemini: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
  },
  projects: [],
}

describe('D7 Project Workspaces', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let originalCwd: string
  let userConfigPath: string

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-project-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    originalCwd = process.cwd()

    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace
    // chdir so that loadConfig() with default root picks up our base config.
    process.chdir(tempWorkspace)

    userConfigPath = path.join(tempWorkspace, '.skill-manager', 'config.json')

    await writeFile(
      path.join(tempWorkspace, 'skill-manager.config.json'),
      JSON.stringify(BASE_CONFIG, null, 2),
    )
  })

  after(async () => {
    process.chdir(originalCwd)
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(tempWorkspace, { recursive: true, force: true })
  })

  beforeEach(async () => {
    // Reset user config between tests so order does not matter.
    await mkdir(path.dirname(userConfigPath), { recursive: true })
    await writeFile(userConfigPath, JSON.stringify({ projects: [] }, null, 2))
    // Wipe any leftover snapshots from previous tests.
    const snapDir = path.join(tempWorkspace, '.skill-manager', 'backups', 'config-snapshots')
    await rm(snapDir, { recursive: true, force: true })
  })

  it('can add a project and scan its directory', async () => {
    const projDir = path.join(tempWorkspace, 'test-project')
    await mkdir(projDir, { recursive: true })

    // Create some structure inside the project
    await mkdir(path.join(projDir, '.claude', 'skills'), { recursive: true })
    await writeFile(path.join(projDir, 'CLAUDE.md'), 'test rules')

    // Initial config should have no projects
    let config = await loadConfig()
    assert.deepEqual(config.projects, [])

    const newProject = {
      id: 'proj_test',
      name: 'Test Project',
      path: projDir,
      enabledAgents: ['claude'] as any,
      allowProjectSkill: true,
      allowProjectRule: true,
    }

    // Save project config
    await saveConfig({ projects: [newProject] })

    // Reload config and verify project is present
    config = await loadConfig()
    assert.equal(config.projects.length, 1)
    assert.equal(config.projects[0].name, 'Test Project')
    assert.equal(config.projects[0].path, projDir)

    // Scan project workspace
    const scanResult = await scanProject(config.projects[0])
    assert.equal(scanResult.projectId, 'proj_test')
    assert.equal(scanResult.skillDirs.length, 1)
    assert.ok(scanResult.skillDirs[0].endsWith(path.join('.claude', 'skills')))
    assert.equal(scanResult.ruleFiles.length, 1)
    assert.ok(scanResult.ruleFiles[0].endsWith('CLAUDE.md'))
  })

  describe('project remove', () => {
    it('throws NOT_FOUND for missing project id', async () => {
      await assert.rejects(
        async () => removeProject('proj_does_not_exist', true),
        (err: unknown) => {
          assert.ok(err instanceof AppError)
          assert.equal((err as AppError).code, 'NOT_FOUND')
          return true
        },
      )
    })

    it('throws CONFIRMATION_REQUIRED when confirmed is not strictly true', async () => {
      // First register a project.
      const projDir = path.join(tempWorkspace, 'no-confirm-project')
      await mkdir(projDir, { recursive: true })
      await saveConfig({
        projects: [
          {
            id: 'proj_noconfirm',
            name: 'NoConfirm',
            path: projDir,
            enabledAgents: ['claude'],
            allowProjectSkill: true,
            allowProjectRule: true,
          },
        ],
      })

      await assert.rejects(
        async () => removeProject('proj_noconfirm', false),
        (err: unknown) => {
          assert.ok(err instanceof AppError)
          assert.equal((err as AppError).code, 'CONFIRMATION_REQUIRED')
          return true
        },
      )

      // Confirm config untouched.
      const config = await loadConfig()
      assert.equal(config.projects.length, 1)
    })

    it('removes a project, leaves files intact, and snapshots config', async () => {
      const projDir = path.join(tempWorkspace, 'remove-target')
      await mkdir(path.join(projDir, '.claude', 'skills', 'my-skill'), { recursive: true })
      await writeFile(path.join(projDir, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'data')
      await writeFile(path.join(projDir, 'CLAUDE.md'), 'rules')

      await saveConfig({
        projects: [
          {
            id: 'proj_remove',
            name: 'RemoveTarget',
            path: projDir,
            enabledAgents: ['claude'],
            allowProjectSkill: true,
            allowProjectRule: true,
          },
        ],
      })

      const beforeRaw = await readFile(userConfigPath, 'utf8')

      const result = await removeProject('proj_remove', true)

      // projects list shrunk.
      assert.equal(result.projects.length, 0)
      // On-disk config updated.
      const afterConfig = await loadConfig()
      assert.equal(afterConfig.projects.length, 0)
      // Snapshot exists and matches the pre-removal config bytes.
      assert.ok(await pathExists(result.backupPath))
      const snapRaw = await readFile(result.backupPath, 'utf8')
      assert.equal(snapRaw, beforeRaw)
      assert.ok(result.backupPath.includes(`remove-project-proj_remove-`))
      // Project files preserved.
      assert.ok(await pathExists(path.join(projDir, '.claude', 'skills', 'my-skill', 'SKILL.md')))
      assert.ok(await pathExists(path.join(projDir, 'CLAUDE.md')))
    })

    it('buildRemovePreview reports skill installs and rule files', async () => {
      const projDir = path.join(tempWorkspace, 'preview-target')
      await mkdir(path.join(projDir, '.claude', 'skills', 'demo-skill'), { recursive: true })
      await writeFile(path.join(projDir, 'CLAUDE.md'), 'rules')

      // Seed registry with a projectInstalls entry pointing to this project.
      const registryPath = path.join(tempWorkspace, 'library', 'registry.json')
      await mkdir(path.dirname(registryPath), { recursive: true })
      await writeFile(
        registryPath,
        JSON.stringify(
          {
            version: 1,
            skills: {
              'demo-skill': {
                projectInstalls: [
                  { projectId: 'proj_preview', target: 'claude:project', checksum: 'sha256:x', deployedAt: '' },
                ],
              },
            },
          },
          null,
          2,
        ),
      )

      const project = {
        id: 'proj_preview',
        name: 'PreviewTarget',
        path: projDir,
        enabledAgents: ['claude'],
        allowProjectSkill: true,
        allowProjectRule: true,
      }

      const preview = await buildRemovePreview(project)
      assert.equal(preview.project.id, 'proj_preview')
      assert.equal(preview.skillInstalls.length, 1)
      assert.equal(preview.skillInstalls[0].skill, 'demo-skill')
      assert.equal(preview.skillInstalls[0].agent, 'claude')
      assert.ok(preview.skillInstalls[0].absolutePath.endsWith(path.join('.claude', 'skills', 'demo-skill')))
      assert.equal(preview.skillInstalls[0].exists, true)
      assert.equal(preview.ruleFiles.length, 1)
      assert.equal(preview.ruleFiles[0].file, 'CLAUDE.md')
      assert.ok(preview.ruleFiles[0].exists)
    })

    it('does not modify config when snapshot fails', async () => {
      const projDir = path.join(tempWorkspace, 'snapshot-fail')
      await mkdir(projDir, { recursive: true })
      await saveConfig({
        projects: [
          {
            id: 'proj_snapfail',
            name: 'SnapFail',
            path: projDir,
            enabledAgents: ['claude'],
            allowProjectSkill: true,
            allowProjectRule: true,
          },
        ],
      })

      const beforeRaw = await readFile(userConfigPath, 'utf8')

      // Pre-create the snapshot file as a directory so copyFile fails.
      const fakeSnapDir = path.join(
        tempWorkspace,
        '.skill-manager',
        'backups',
        'config-snapshots',
        'remove-project-proj_snapfail-blocker',
      )
      await mkdir(fakeSnapDir, { recursive: true })

      // Make snapshotDir unwritable so the next snapshot attempt fails.
      const snapDir = path.join(tempWorkspace, '.skill-manager', 'backups', 'config-snapshots')
      await rm(snapDir, { recursive: true, force: true })
      // Replace it with a file: ensureDir mkdir on a path where parent is a regular
      // file will fail on most platforms.
      await writeFile(snapDir, 'blocker')

      try {
        await assert.rejects(
          async () => removeProject('proj_snapfail', true),
          (err: unknown) => {
            assert.ok(err instanceof AppError)
            assert.equal((err as AppError).code, 'CONFIG_SNAPSHOT_FAILED')
            return true
          },
        )

        // Config on disk is unchanged.
        const afterRaw = await readFile(userConfigPath, 'utf8')
        assert.equal(afterRaw, beforeRaw)

        const config = await loadConfig()
        assert.equal(config.projects.length, 1)
      } finally {
        // Cleanup the blocker so subsequent tests can chdir normally.
        await rm(snapDir, { force: true })
        await rm(fakeSnapDir, { recursive: true, force: true })
      }
    })
  })
})