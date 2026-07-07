import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/core/config.js'
import { loadRegistry, saveRegistry } from '../../src/core/registry.js'
import { planSync, applySyncPlan } from '../../src/sync/engine.js'
import { writeDeployTag, readDeployTag } from '../../src/sync/deploy-tag.js'
import { pathExists } from '../../src/utils/fs.js'
import { AppError } from '../../src/utils/errors.js'

describe('D3b Bidirectional & Cross-Agent Sync', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let claudeSkillsDir: string
  let codexSkillsDir: string

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-sync-bidir-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    claudeSkillsDir = path.join(tempWorkspace, 'claude-skills')
    codexSkillsDir = path.join(tempWorkspace, 'codex-skills')
    await mkdir(claudeSkillsDir, { recursive: true })
    await mkdir(codexSkillsDir, { recursive: true })

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
          enabled: true,
          userSkillPath: codexSkillsDir,
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

  it('pulls from Claude to Local with backup and registry updates', async () => {
    const skillName = 'bidir-skill'
    const localDir = path.join(tempWorkspace, 'library', 'skills', skillName)
    const developmentDir = path.join(tempWorkspace, 'dev-skills', skillName)
    const claudeSkillDir = path.join(claudeSkillsDir, skillName)

    await mkdir(localDir, { recursive: true })
    await mkdir(developmentDir, { recursive: true })
    await mkdir(claudeSkillDir, { recursive: true })

    // Local code
    await writeFile(path.join(localDir, 'SKILL.md'), '---\nname: bidir-skill\nversion: 1.0.0\ndescription: local description\n---\nLocal Code')
    // Development/import directory starts with the same old version and should be updated by pull.
    await writeFile(path.join(developmentDir, 'SKILL.md'), '---\nname: bidir-skill\nversion: 1.0.0\ndescription: local description\n---\nDevelopment Code')
    // Claude code has changes and updated version
    await writeFile(path.join(claudeSkillDir, 'SKILL.md'), '---\nname: bidir-skill\nversion: 1.5.0\ndescription: updated description\n---\nClaude Code')

    // Initial registry save
    const registry = await loadRegistry(tempWorkspace)
    registry.skills[skillName] = {
      name: skillName,
      version: '1.0.0',
      description: 'local description',
      checksum: 'sha256:local-init-checksum' as any,
      localPath: developmentDir,
      syncedTargets: [],
      projectInstalls: []
    }
    await saveRegistry(registry, tempWorkspace)

    // Save deploy tag on Claude side to simulate it was managed
    await writeDeployTag(claudeSkillDir, {
      managedBy: 'AgentSkillManager',
      skillName,
      sourcePath: localDir,
      sourceHash: 'sha256:some-older-hash',
      target: 'claude:user',
      deployedAt: '2026-07-06'
    })

    // Plan pull (from Claude:user to local)
    const planResult = await planSync(skillName, ['local'], { from: 'claude:user' }, tempWorkspace)
    assert.equal(planResult.plan.items.length, 1)
    assert.equal(planResult.plan.items[0].kind, 'modify')
    assert.equal(planResult.plan.items[0].targetKey, 'local')

    // Apply pull
    const applyResult = await applySyncPlan(planResult.plan.planId, {}, tempWorkspace)
    assert.equal(applyResult.applied.length, 1)

    // Verify local code updated to Claude version
    const localContent = await readFile(path.join(localDir, 'SKILL.md'), 'utf8')
    assert.ok(localContent.includes('Claude Code'))
    assert.ok(!localContent.includes('Local Code'))

    // Verify development/import directory is also updated.
    const developmentContent = await readFile(path.join(developmentDir, 'SKILL.md'), 'utf8')
    assert.ok(developmentContent.includes('Claude Code'))
    assert.ok(!developmentContent.includes('Development Code'))

    // Verify local registry entry updated (version & description re-parsed from updated SKILL.md)
    const updatedRegistry = await loadRegistry(tempWorkspace)
    const updatedSkill = updatedRegistry.skills[skillName]
    assert.equal(updatedSkill.version, '1.5.0')
    assert.equal(updatedSkill.description, 'updated description')
    assert.equal(updatedSkill.localPath, developmentDir)
    assert.ok(updatedSkill.syncedTargets.includes('claude:user'))

    // Verify backup created under backups/bk_*
    const backupsDir = path.join(tempWorkspace, 'backups')
    const backupEntries = await readdir(backupsDir)
    const bkFolder = backupEntries.find(e => e.startsWith('bk_'))
    assert.ok(bkFolder)
    const backupRegistrySnapshot = path.join(backupsDir, bkFolder, 'registry-snapshot.json')
    assert.ok(await pathExists(backupRegistrySnapshot))
    const backupSkillDir = path.join(backupsDir, bkFolder, 'library', 'skills', skillName)
    assert.ok(await pathExists(backupSkillDir))

    const backupIndexes = await Promise.all(
      backupEntries
        .filter(e => e.startsWith('bk_'))
        .map(async e => JSON.parse(await readFile(path.join(backupsDir, e, 'index.json'), 'utf8')))
    )
    assert.ok(
      backupIndexes.some(index =>
        index.items.some((item: any) => item.targetType === 'development' && item.originalPath === developmentDir)
      )
    )
  })

  it('performs cross-agent sync (from Claude to Codex via Local)', async () => {
    const skillName = 'bidir-skill'
    const claudeSkillDir = path.join(claudeSkillsDir, skillName)
    const codexSkillDir = path.join(codexSkillsDir, skillName)

    // Modify Claude code again
    await writeFile(path.join(claudeSkillDir, 'SKILL.md'), '---\nname: bidir-skill\nversion: 2.0.0\ndescription: cross-agent description\n---\nClaude Version 2')

    // Plan cross-agent sync (from Claude:user to Codex:user)
    // Codex:user is specified, but since from is claude:user, it implicitly inserts local target first
    const planResult = await planSync(skillName, ['codex:user'], { from: 'claude:user' }, tempWorkspace)
    
    // Items should be: local (modify) and codex:user (create)
    assert.equal(planResult.plan.items.length, 2)
    assert.equal(planResult.plan.items[0].targetKey, 'local')
    assert.equal(planResult.plan.items[1].targetKey, 'codex:user')

    // Apply cross-agent sync
    const applyResult = await applySyncPlan(planResult.plan.planId, {}, tempWorkspace)
    assert.equal(applyResult.applied.length, 2)

    // Verify Codex code updated
    const codexContent = await readFile(path.join(codexSkillDir, 'SKILL.md'), 'utf8')
    assert.ok(codexContent.includes('Claude Version 2'))

    // Verify registry metadata updated
    const updatedRegistry = await loadRegistry(tempWorkspace)
    const updatedSkill = updatedRegistry.skills[skillName]
    assert.equal(updatedSkill.version, '2.0.0')
    assert.ok(updatedSkill.syncedTargets.includes('codex:user'))

    const developmentContent = await readFile(path.join(updatedSkill.localPath, 'SKILL.md'), 'utf8')
    assert.ok(developmentContent.includes('Claude Version 2'))
  })
})
