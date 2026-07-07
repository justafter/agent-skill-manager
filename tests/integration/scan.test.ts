import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/core/config.js'
import { loadRegistry, saveRegistry } from '../../src/core/registry.js'
import { createAdapters } from '../../src/adapters/registry.js'
import { identifySkillState } from '../../src/adapters/scan.js'
import { scanDevelopmentSkill } from '../../src/core/development-scan.js'
import { importSkill } from '../../src/core/import.js'
import { diffDirectories } from '../../src/rules/diff.js'
import { writeDeployTag } from '../../src/sync/deploy-tag.js'
import { pathExists } from '../../src/utils/fs.js'

describe('D2 User-level Scan, List & Diff', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let claudeSkillsDir: string

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-scan-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    claudeSkillsDir = path.join(tempWorkspace, 'claude-skills')
    await mkdir(claudeSkillsDir, { recursive: true })

    const defaultConfig = {
      backupDir: './backups',
      devDir: '',
      ruleTemplateDir: './library/rules',
      server: { host: '127.0.0.1', port: 47821 },
      targets: {
        claude: {
          enabled: true,
          userSkillPath: claudeSkillsDir,
          projectSkillPath: '',
          projectRuleFile: ''
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
      projects: []
    }
    await writeFile(
      path.join(tempWorkspace, 'skill-manager.config.json'),
      JSON.stringify(defaultConfig, null, 2)
    )

    await mkdir(path.join(tempWorkspace, 'library', 'skills'), { recursive: true })
  })

  after(async () => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(tempWorkspace, { recursive: true, force: true })
  })

  it('scans successfully when target exists or does not exist', async () => {
    // 1. Setup a skill in registry and local library
    const skillName = 'scan-skill'
    const sourceDir = path.join(tempWorkspace, 'library', 'skills', skillName)
    await mkdir(sourceDir, { recursive: true })
    await writeFile(path.join(sourceDir, 'SKILL.md'), '---\nname: scan-skill\nversion: 1.0.0\ndescription: test\n---\n')

    const registry = await loadRegistry(tempWorkspace)
    registry.skills[skillName] = {
      name: skillName,
      version: '1.0.0',
      description: 'test',
      checksum: 'sha256:source-checksum' as any,
      localPath: sourceDir,
      syncedTargets: [],
      projectInstalls: []
    }
    await saveRegistry(registry, tempWorkspace)

    // 2. Scan targets. Codex is disabled, Claude is enabled but empty.
    const config = await loadConfig(tempWorkspace)
    const adapters = createAdapters(config)
    
    // Test scanUserSkills when empty
    const claudeAdapter = adapters.claude
    const scanned = await claudeAdapter.scanUserSkills()
    assert.deepEqual(scanned, {})

    // identifySkillState for missing target
    const stateMissing = identifySkillState(registry.skills[skillName], undefined)
    assert.equal(stateMissing, 'missing')
  })

  it('identifies identical status when checksum matches', async () => {
    const skillName = 'scan-skill'
    const targetSkillDir = path.join(claudeSkillsDir, skillName)
    await mkdir(targetSkillDir, { recursive: true })
    await writeFile(path.join(targetSkillDir, 'SKILL.md'), '---\nname: scan-skill\nversion: 1.0.0\ndescription: test\n---\n')

    const config = await loadConfig(tempWorkspace)
    const adapters = createAdapters(config)
    const targetSkills = await adapters.claude.scanUserSkills()
    const targetInfo = targetSkills[skillName]

    assert.ok(targetInfo)
    assert.equal(targetInfo.detected, true)

    const registry = await loadRegistry(tempWorkspace)
    const sourceSkill = registry.skills[skillName]
    
    // Set checksum to match
    sourceSkill.checksum = targetInfo.checksum
    await saveRegistry(registry, tempWorkspace)

    const state = identifySkillState(sourceSkill, targetInfo)
    assert.equal(state, 'identical')
  })

  it('identifies conflict status when checksum differs and deploy tag is missing', async () => {
    const skillName = 'scan-skill'
    const registry = await loadRegistry(tempWorkspace)
    const sourceSkill = registry.skills[skillName]

    // Set registry checksum to a different value
    sourceSkill.checksum = 'sha256:different-checksum' as any
    await saveRegistry(registry, tempWorkspace)

    const config = await loadConfig(tempWorkspace)
    const adapters = createAdapters(config)
    const targetSkills = await adapters.claude.scanUserSkills()
    const targetInfo = targetSkills[skillName]

    const state = identifySkillState(sourceSkill, targetInfo)
    assert.equal(state, 'conflict')
  })

  it('identifies changed status when checksum differs and deploy tag exists', async () => {
    const skillName = 'scan-skill'
    const targetSkillDir = path.join(claudeSkillsDir, skillName)

    // Write deploy tag
    await writeDeployTag(targetSkillDir, {
      managedBy: 'AgentSkillManager',
      skillName,
      sourcePath: 'dummy',
      sourceHash: 'dummy',
      target: 'claude:user',
      deployedAt: '2026-07-06'
    })

    const config = await loadConfig(tempWorkspace)
    const adapters = createAdapters(config)
    const targetSkills = await adapters.claude.scanUserSkills()
    const targetInfo = targetSkills[skillName]

    assert.ok(targetInfo.deployTag)
    assert.equal(targetInfo.deployTag.managedBy, 'AgentSkillManager')

    const registry = await loadRegistry(tempWorkspace)
    const sourceSkill = registry.skills[skillName]

    const state = identifySkillState(sourceSkill, targetInfo)
    assert.equal(state, 'changed')
  })

  it('identifies untracked status when skill is present on target but missing in registry', async () => {
    const untrackedSkillName = 'untracked-skill'
    const targetSkillDir = path.join(claudeSkillsDir, untrackedSkillName)
    await mkdir(targetSkillDir, { recursive: true })
    await writeFile(path.join(targetSkillDir, 'SKILL.md'), '---\nname: untracked-skill\nversion: 1.0.0\ndescription: untracked\n---\n')

    const config = await loadConfig(tempWorkspace)
    const adapters = createAdapters(config)
    const targetSkills = await adapters.claude.scanUserSkills()
    
    assert.ok(targetSkills[untrackedSkillName])
    
    const registry = await loadRegistry(tempWorkspace)
    assert.ok(!registry.skills[untrackedSkillName])
  })

  it('detects changed development localPath and clears it after re-import', async () => {
    const skillName = 'dev-drift-skill'
    const skillSourcePath = path.join(tempWorkspace, skillName)
    await mkdir(skillSourcePath, { recursive: true })
    await writeFile(
      path.join(skillSourcePath, 'SKILL.md'),
      '---\nname: dev-drift-skill\nversion: 1.0.0\ndescription: dev drift\n---\n'
    )

    const imported = await importSkill(skillSourcePath, {}, tempWorkspace)
    assert.equal(imported.status, 'imported')

    let registry = await loadRegistry(tempWorkspace)
    let devState = await scanDevelopmentSkill(registry.skills[skillName])
    assert.equal(devState.status, 'identical')

    await writeFile(
      path.join(skillSourcePath, 'SKILL.md'),
      '---\nname: dev-drift-skill\nversion: 1.0.1\ndescription: dev drift changed\n---\n'
    )

    registry = await loadRegistry(tempWorkspace)
    devState = await scanDevelopmentSkill(registry.skills[skillName])
    assert.equal(devState.status, 'changed')

    await importSkill(skillSourcePath, { force: true }, tempWorkspace)
    registry = await loadRegistry(tempWorkspace)
    devState = await scanDevelopmentSkill(registry.skills[skillName])
    assert.equal(devState.status, 'identical')
  })

  it('diffs directories correctly for added, removed and changed files', async () => {
    const sourceDir = path.join(tempWorkspace, 'diff-source')
    const targetDir = path.join(tempWorkspace, 'diff-target')

    await mkdir(sourceDir, { recursive: true })
    await mkdir(targetDir, { recursive: true })

    // 1. Added file (in source, missing in target)
    await writeFile(path.join(sourceDir, 'added.txt'), 'content of added file')

    // 2. Removed file (missing in source, exists in target)
    await writeFile(path.join(targetDir, 'removed.txt'), 'content of removed file')

    // 3. Changed file (both exist, content differs)
    await writeFile(path.join(sourceDir, 'changed.txt'), 'content in source')
    await writeFile(path.join(targetDir, 'changed.txt'), 'content in target')

    // 4. Identical file (both exist, identical content)
    await writeFile(path.join(sourceDir, 'identical.txt'), 'same content')
    await writeFile(path.join(targetDir, 'identical.txt'), 'same content')

    const diff = await diffDirectories(sourceDir, targetDir)
    assert.equal(diff.files.length, 3)

    const added = diff.files.find((f) => f.path === 'added.txt')
    assert.ok(added)
    assert.equal(added.status, 'added')

    const removed = diff.files.find((f) => f.path === 'removed.txt')
    assert.ok(removed)
    assert.equal(removed.status, 'removed')

    const changed = diff.files.find((f) => f.path === 'changed.txt')
    assert.ok(changed)
    assert.equal(changed.status, 'changed')
    assert.ok(changed.patch)
    assert.ok(changed.patch.includes('content in target'))
    assert.ok(changed.patch.includes('content in source'))
  })
})
