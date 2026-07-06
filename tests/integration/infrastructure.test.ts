import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { AppError } from '../../src/utils/errors.js'
import { expandUserProfile } from '../../src/utils/paths.js'
import { loadConfig, saveConfig, getUserConfigPath } from '../../src/core/config.js'
import { loadRegistry, saveRegistry } from '../../src/core/registry.js'
import { assertSafeWritePath } from '../../src/projects/guard.js'
import type { ResolvedConfig } from '../../src/types/config.js'
import { pathExists } from '../../src/utils/fs.js'

describe('D0 Infrastructure', () => {
  let tempDir: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined

  before(async () => {
    // Create a temporary directory for testing
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'asm-infra-test-'))

    // Redirect user profile to temp directory to test user configuration
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempDir
    process.env.HOME = tempDir
  })

  after(async () => {
    // Restore environment variables
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome

    // Clean up temporary files
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('AppError', () => {
    it('serializes to JSON correctly', () => {
      const details = { path: '/invalid' }
      const err = new AppError('TEST_CODE', 'Test message', details)
      assert.equal(err.code, 'TEST_CODE')
      assert.equal(err.message, 'Test message')
      assert.deepEqual(err.toJSON(), {
        code: 'TEST_CODE',
        message: 'Test message',
        details
      })
    })
  })

  describe('Path Utilities', () => {
    it('expands user profile correctly', () => {
      const pathWithProfile = '%USERPROFILE%/test-path'
      const expanded = expandUserProfile(pathWithProfile)
      assert.equal(expanded, path.join(tempDir, 'test-path'))
    })
  })

  describe('Configuration Merge & Save', () => {
    it('deep merges user config on top of base config', async () => {
      const userConfigPath = getUserConfigPath()
      const userConfigData = {
        devDir: '/my/custom/dev/dir',
        targets: {
          claude: {
            enabled: false
          }
        },
        projects: [
          {
            id: 'test-project',
            name: 'Test Project',
            path: '/my/project/path',
            enabledAgents: ['claude']
          }
        ]
      }

      await saveConfig(userConfigData as any)

      // Verify config file was created
      assert.ok(await pathExists(userConfigPath))

      const config = await loadConfig(process.cwd())

      // devDir is overridden
      assert.equal(config.devDir, '/my/custom/dev/dir')
      // Claude is disabled
      assert.equal(config.targets.claude.enabled, false)
      // Claude non-overridden options are inherited
      assert.equal(config.targets.claude.projectRuleFile, 'CLAUDE.md')
      // Project workspace list is loaded
      assert.equal(config.projects.length, 1)
      assert.equal(config.projects[0].id, 'test-project')
    })
  })

  describe('Registry Read/Write', () => {
    it('returns empty template if registry does not exist, and loads saved registry', async () => {
      const registry = await loadRegistry(tempDir)
      assert.equal(registry.version, 1)
      assert.deepEqual(registry.skills, {})

      const mockRegistry = {
        version: 1,
        skills: {
          'test-skill': {
            name: 'test-skill',
            version: '1.0.0',
            description: 'Test Skill',
            localPath: '/some/path',
            checksum: 'sha256:abc' as const,
            hasScripts: false,
            hasReferences: false,
            hasAssets: false,
            lastModified: new Date().toISOString(),
            syncedTargets: [],
            projectInstalls: []
          }
        }
      }

      await saveRegistry(mockRegistry, tempDir)
      const loaded = await loadRegistry(tempDir)
      assert.equal(loaded.skills['test-skill'].version, '1.0.0')
    })
  })

  describe('Path Guard Security', () => {
    it('allows writes inside safe zones and rejects out-of-bounds writes', async () => {
      const mockProjectDir = path.join(tempDir, 'my-project')
      const mockUserSkillDir = path.join(tempDir, 'claude-skills')
      const mockBackupDir = path.join(tempDir, 'backups')

      await mkdir(mockProjectDir, { recursive: true })
      await mkdir(mockUserSkillDir, { recursive: true })
      await mkdir(mockBackupDir, { recursive: true })

      const config: ResolvedConfig = {
        backupDir: mockBackupDir,
        devDir: '',
        ruleTemplateDir: '',
        server: { host: '127.0.0.1', port: 47821 },
        targets: {
          claude: {
            enabled: true,
            userSkillPath: mockUserSkillDir,
            projectSkillPath: '.claude/skills',
            projectRuleFile: 'CLAUDE.md'
          },
          codex: {
            enabled: false,
            userSkillPath: '',
            projectSkillPath: '',
            projectRuleFile: ''
          },
          gemini: {
            enabled: false,
            userSkillPath: '',
            projectSkillPath: '',
            projectRuleFile: ''
          }
        },
        projects: [
          {
            id: 'my-proj',
            name: 'My Project',
            path: mockProjectDir,
            enabledAgents: ['claude'],
            allowProjectSkill: true,
            allowProjectRule: true
          }
        ]
      }

      // Valid paths
      const safeProjectFile = path.join(mockProjectDir, 'src/index.ts')
      const safeSkillFile = path.join(mockUserSkillDir, 'my-skill/SKILL.md')
      const safeBackupFile = path.join(mockBackupDir, 'backup-1.tar.gz')

      // Should not throw
      await assertSafeWritePath(safeProjectFile, config)
      await assertSafeWritePath(safeSkillFile, config)
      await assertSafeWritePath(safeBackupFile, config)

      // Invalid paths (traversal or outside allowed dirs)
      const unsafeFile = path.join(tempDir, 'secrets.json')
      const traversalFile = path.join(mockProjectDir, '../secrets.json')

      await assert.rejects(
        assertSafeWritePath(unsafeFile, config),
        (err: any) => err instanceof AppError && err.code === 'PATH_OUT_OF_BOUNDS'
      )

      await assert.rejects(
        assertSafeWritePath(traversalFile, config),
        (err: any) => err instanceof AppError && err.code === 'PATH_OUT_OF_BOUNDS'
      )
    })
  })
})
