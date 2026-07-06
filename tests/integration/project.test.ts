import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig, saveConfig } from '../../src/core/config.js'
import { scanProject } from '../../src/projects/scanner.js'
import { pathExists } from '../../src/utils/fs.js'

describe('D7 Project Workspaces', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-project-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    // Write a dummy base configuration in the processo cwd simulation
    const defaultConfig = {
      backupDir: './backups',
      devDir: '',
      ruleTemplateDir: './library/rules',
      server: { host: '127.0.0.1', port: 47821 },
      targets: {
        claude: { enabled: true, userSkillPath: '', projectSkillPath: '.claude/skills', projectRuleFile: '' },
        codex: { enabled: true, userSkillPath: '', projectSkillPath: '.agents/skills', projectRuleFile: '' },
        gemini: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' }
      },
      projects: []
    }
    await writeFile(
      path.join(tempWorkspace, 'skill-manager.config.json'),
      JSON.stringify(defaultConfig, null, 2)
    )
  })

  after(async () => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(tempWorkspace, { recursive: true, force: true })
  })

  it('can add a project and scan its directory', async () => {
    const projDir = path.join(tempWorkspace, 'test-project')
    await mkdir(projDir, { recursive: true })
    
    // Create some structure inside the project
    await mkdir(path.join(projDir, '.claude', 'skills'), { recursive: true })
    await writeFile(path.join(projDir, 'CLAUDE.md'), 'test rules')

    // Initial config should have no projects
    let config = await loadConfig(tempWorkspace)
    assert.deepEqual(config.projects, [])

    const newProject = {
      id: 'proj_test',
      name: 'Test Project',
      path: projDir,
      enabledAgents: ['claude'] as any,
      allowProjectSkill: true,
      allowProjectRule: true
    }

    // Save project config
    await saveConfig({ projects: [newProject] })

    // Reload config and verify project is present
    config = await loadConfig(tempWorkspace)
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
})
