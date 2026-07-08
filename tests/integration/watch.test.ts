import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/core/config.js'
import { startWatch, stopWatch, runRuleScan, getRuleScanStatus } from '../../src/core/watch.js'
import { pathExists } from '../../src/utils/fs.js'

describe('D9 Watch Mode', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let devDir: string
  let targetUserDir: string

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-watch-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    devDir = path.join(tempWorkspace, 'dev-skill')
    await mkdir(devDir, { recursive: true })
    await writeFile(
      path.join(devDir, 'SKILL.md'),
      '---\nname: dev-skill\ndescription: A dev skill\nversion: 1.0.0\n---\nInitial content\n',
      'utf8',
    )

    targetUserDir = path.join(tempWorkspace, '.claude', 'skills')
    await mkdir(targetUserDir, { recursive: true })

    const defaultConfig = {
      backupDir: './backups',
      devDir,
      ruleTemplateDir: './library/rules',
      server: { host: '127.0.0.1', port: 47821 },
      targets: {
        claude: {
          enabled: true,
          userSkillPath: targetUserDir,
          projectSkillPath: '.claude/skills',
          projectRuleFile: 'CLAUDE.md',
        },
        codex: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
        gemini: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
      },
      projects: [],
    }
    await writeFile(path.join(tempWorkspace, 'skill-manager.config.json'), JSON.stringify(defaultConfig, null, 2))

    // Setup registry.json
    const defaultRegistry = {
      version: 1,
      skills: {
        'dev-skill': {
          name: 'dev-skill',
          version: '1.0.0',
          description: 'A dev skill',
          localPath: devDir,
          checksum: 'initial-checksum',
          syncedTargets: ['claude:user'],
          projectInstalls: [],
        },
      },
    }
    await mkdir(path.join(tempWorkspace, 'library'), { recursive: true })
    await writeFile(
      path.join(tempWorkspace, 'library', 'registry.json'),
      JSON.stringify(defaultRegistry, null, 2),
      'utf8',
    )
  })

  after(async () => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(tempWorkspace, { recursive: true, force: true })
  })

  it('watches developer directory and automatically syncs changes to targets', async () => {
    // 1. Start watch mode for 'dev-skill'
    await startWatch('dev-skill', ['claude:user'], tempWorkspace)

    // Wait for chokidar to initialize and bind OS watchers
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 2. Modify dev-skill SKILL.md content
    const updatedContent = '---\nname: dev-skill\ndescription: A dev skill\nversion: 1.0.1\n---\nUpdated content\n'
    await writeFile(path.join(devDir, 'SKILL.md'), updatedContent, 'utf8')

    // 3. Wait for chokidar file change detection + 500ms debounce + copy operation
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // 4. Verify canonical library is updated
    const canonicalPath = path.join(tempWorkspace, 'library', 'skills', 'dev-skill', 'SKILL.md')
    assert.ok(await pathExists(canonicalPath))
    const canonicalContent = await readFile(canonicalPath, 'utf8')
    assert.ok(canonicalContent.includes('Updated content'))

    // 5. Verify target user directory is updated
    const targetPath = path.join(targetUserDir, 'dev-skill', 'SKILL.md')
    assert.ok(await pathExists(targetPath))
    const targetContent = await readFile(targetPath, 'utf8')
    assert.ok(targetContent.includes('Updated content'))

    // 6. Stop watch mode
    await stopWatch('dev-skill')
  })

  it('scans project rule files and detects changes on demand without auto-syncing', async () => {
    // 1. Setup a project directory inside tempWorkspace
    const projDir = path.join(tempWorkspace, 'proj-1')
    await mkdir(projDir, { recursive: true })
    const claudeRuleFile = path.join(projDir, 'CLAUDE.md')
    // Create an initial Claude rule file that differs from template
    await writeFile(claudeRuleFile, 'Modified Claude Rule content without manager block', 'utf8')

    // Create a dummy template rule file in library/rules/claude/CLAUDE.md
    const templateDir = path.join(tempWorkspace, 'library', 'rules', 'claude')
    await mkdir(templateDir, { recursive: true })
    await writeFile(path.join(templateDir, 'CLAUDE.md'), 'Template content', 'utf8')

    // Update config to have a project
    const currentConfig = JSON.parse(await readFile(path.join(tempWorkspace, 'skill-manager.config.json'), 'utf8'))
    currentConfig.projects.push({
      id: 'proj-1',
      name: 'Project 1',
      path: projDir,
      enabledAgents: ['claude'],
      allowProjectSkill: true,
      allowProjectRule: true,
      ruleTemplates: {
        claude: 'CLAUDE.md',
      },
    })
    await writeFile(path.join(tempWorkspace, 'skill-manager.config.json'), JSON.stringify(currentConfig, null, 2))

    // 2. Trigger manual scan
    const scanResult = await runRuleScan(tempWorkspace)

    // 3. Verify scanResult contains the change
    const change = scanResult.changes.find((c) => c.projectId === 'proj-1' && c.agent === 'claude')
    assert.ok(change, 'Should detect rule change for proj-1 and agent claude')

    // 4. Verify getRuleScanStatus returns the same changes
    const status = getRuleScanStatus()
    const statusChange = status.changes.find((c) => c.projectId === 'proj-1' && c.agent === 'claude')
    assert.ok(statusChange, 'getRuleScanStatus should also return the changes')
  })
})
