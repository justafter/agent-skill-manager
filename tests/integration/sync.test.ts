import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/core/config.js'
import { loadRegistry, saveRegistry } from '../../src/core/registry.js'
import { planSync, applySyncPlan } from '../../src/sync/engine.js'
import { writeDeployTag, readDeployTag } from '../../src/sync/deploy-tag.js'
import { pathExists, readJson } from '../../src/utils/fs.js'
import { getPlanStatus } from '../../src/core/state.js'
import { AppError } from '../../src/utils/errors.js'

describe('D3a Local Library Push Sync', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let claudeSkillsDir: string
  let codexSkillsDir: string

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-sync-test-'))
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
          enabled: true,
          userSkillPath: path.join(tempWorkspace, 'gemini-skills'),
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

  it('rejects Gemini targets', async () => {
    const skillName = 'test-skill'
    const sourceDir = path.join(tempWorkspace, 'library', 'skills', skillName)
    await mkdir(sourceDir, { recursive: true })
    await writeFile(path.join(sourceDir, 'SKILL.md'), '---\nname: test-skill\nversion: 1.0.0\ndescription: test\n---\n')

    const registry = await loadRegistry(tempWorkspace)
    registry.skills[skillName] = {
      name: skillName,
      version: '1.0.0',
      description: 'test',
      checksum: 'sha256:dummy' as any,
      localPath: sourceDir,
      syncedTargets: [],
      projectInstalls: []
    }
    await saveRegistry(registry, tempWorkspace)

    await assert.rejects(
      planSync(skillName, ['gemini:user'], {}, tempWorkspace),
      (err: any) => err instanceof AppError && err.code === 'TARGET_REFUSED'
    )
  })

  it('performs dry-run with no physical changes', async () => {
    const skillName = 'test-skill'
    const sourceDir = path.join(tempWorkspace, 'library', 'skills', skillName)
    
    // Write new content to canonical source
    await writeFile(path.join(sourceDir, 'SKILL.md'), '---\nname: test-skill\nversion: 1.0.0\ndescription: test\n---\nHello')

    // Recalculate checksum
    const { checksumDirectory } = await import('../../src/utils/hash.js')
    const registry = await loadRegistry(tempWorkspace)
    registry.skills[skillName].checksum = await checksumDirectory(sourceDir)
    await saveRegistry(registry, tempWorkspace)

    // Generate plan
    const result = await planSync(skillName, ['claude:user'], {}, tempWorkspace)
    assert.equal(result.plan.items.length, 1)
    assert.equal(result.plan.items[0].kind, 'create')

    // Target does not exist physically yet
    const targetDir = path.join(claudeSkillsDir, skillName)
    assert.ok(!(await pathExists(targetDir)))
  })

  it('applies plan successfully for create item', async () => {
    const skillName = 'test-skill'
    const planResult = await planSync(skillName, ['claude:user'], {}, tempWorkspace)
    
    const applyResult = await applySyncPlan(planResult.plan.planId, {}, tempWorkspace)
    assert.equal(applyResult.applied.length, 1)
    assert.equal(applyResult.applied[0].kind, 'create')

    // Verify copy
    const targetDir = path.join(claudeSkillsDir, skillName)
    assert.ok(await pathExists(targetDir))
    assert.ok(await pathExists(path.join(targetDir, 'SKILL.md')))

    // Verify DeployTag
    const tag = await readDeployTag(targetDir)
    assert.ok(tag)
    assert.equal(tag.managedBy, 'AgentSkillManager')
    assert.equal(tag.target, 'claude:user')

    // Verify registry syncedTargets updated
    const registry = await loadRegistry(tempWorkspace)
    assert.deepEqual(registry.skills[skillName].syncedTargets, ['claude:user'])

    // Verify plan lifecycle status is executed
    const planStatus = getPlanStatus(planResult.plan.planId)
    assert.equal(planStatus.status, 'executed')
    assert.ok(planStatus.executedAt)
    assert.equal(planStatus.appliedItems?.length, 1)
  })

  it('skips when identical checksum matches', async () => {
    const skillName = 'test-skill'
    const planResult = await planSync(skillName, ['claude:user'], {}, tempWorkspace)
    assert.equal(planResult.plan.items.length, 1)
    assert.equal(planResult.plan.items[0].kind, 'skip')

    const applyResult = await applySyncPlan(planResult.plan.planId, {}, tempWorkspace)
    assert.equal(applyResult.applied.length, 0)
    assert.equal(applyResult.skipped.length, 1)
  })

  it('identifies conflict and refuses overwrite when target is unmanaged', async () => {
    const skillName = 'test-skill'
    const targetDir = path.join(codexSkillsDir, skillName)
    
    // Create unmanaged target skill
    await mkdir(targetDir, { recursive: true })
    await writeFile(path.join(targetDir, 'SKILL.md'), '---\nname: test-skill\nversion: 1.0.0\ndescription: unmanaged\n---\n')

    const planResult = await planSync(skillName, ['codex:user'], {}, tempWorkspace)
    assert.equal(planResult.plan.items.length, 1)
    assert.equal(planResult.plan.items[0].kind, 'conflict')

    const applyResult = await applySyncPlan(planResult.plan.planId, {}, tempWorkspace)
    assert.equal(applyResult.applied.length, 0)
    assert.equal(applyResult.skipped.length, 1)

    // Verify unmanaged target is NOT modified
    const content = await readFile(path.join(targetDir, 'SKILL.md'), 'utf8')
    assert.ok(content.includes('unmanaged'))
  })

  it('identifies conflict by default for managed target with changes', async () => {
    const skillName = 'test-skill'
    const targetDir = path.join(claudeSkillsDir, skillName)

    // Modify target file content to cause checksum mismatch
    await writeFile(path.join(targetDir, 'SKILL.md'), '---\nname: test-skill\nversion: 1.0.0\ndescription: test\n---\nModified manually!')

    // Plan should identify as conflict because allowManagedModify is false by default
    const planResult = await planSync(skillName, ['claude:user'], {}, tempWorkspace)
    assert.equal(planResult.plan.items.length, 1)
    assert.equal(planResult.plan.items[0].kind, 'conflict')
  })

  it('performs modify and backup when allowManagedModify is true', async () => {
    const skillName = 'test-skill'
    const targetDir = path.join(claudeSkillsDir, skillName)

    // Plan with allowManagedModify: true
    const planResult = await planSync(skillName, ['claude:user'], { allowManagedModify: true }, tempWorkspace)
    assert.equal(planResult.plan.items.length, 1)
    assert.equal(planResult.plan.items[0].kind, 'modify')

    // Apply with allowManagedModify: true
    const applyResult = await applySyncPlan(planResult.plan.planId, { allowManagedModify: true }, tempWorkspace)
    assert.equal(applyResult.applied.length, 1)
    assert.equal(applyResult.applied[0].kind, 'modify')

    // Verify backup created under backups/bk_*
    const backupsDir = path.join(tempWorkspace, 'backups')
    const backupId = planResult.plan.backupId || (await readdir(backupsDir))[0]
    
    // In D3a backupId is generated dynamically in applySyncPlan
    // Let's find the backup folder
    const backupEntries = await readdir(backupsDir)
    const bkId = backupEntries.find(e => e.startsWith('bk_'))
    assert.ok(bkId)

    const backupIndexFile = path.join(backupsDir, bkId, 'index.json')
    assert.ok(await pathExists(backupIndexFile))

    const backupIndex = JSON.parse(await readFile(backupIndexFile, 'utf8'))
    assert.ok(backupIndex.items.find((item: any) => item.targetAgent === 'claude' && item.targetType === 'user'))

    // Verify target file is updated
    const content = await readFile(path.join(targetDir, 'SKILL.md'), 'utf8')
    assert.ok(!content.includes('Modified manually!'))
    assert.ok(content.includes('Hello'))
  })

  it('rolls back registry on apply exception', async () => {
    const skillName = 'test-skill'

    // Force plan to create a modify/create item for codex
    // But we will lock Codex dir or trigger a safety violation to cause apply failure
    await rm(path.join(codexSkillsDir, skillName), { recursive: true, force: true })
    const planResult = await planSync(skillName, ['codex:user'], {}, tempWorkspace)
    
    // Corrupt config or targetDir to cause path guard failure
    const badPlanItem = planResult.plan.items[0]
    badPlanItem.target = 'C:\\forbidden\\path'
    badPlanItem.targetDir = 'C:\\forbidden\\path'

    const registryBefore = await loadRegistry(tempWorkspace)
    const syncedBefore = registryBefore.skills[skillName].syncedTargets

    await assert.rejects(
      applySyncPlan(planResult.plan.planId, {}, tempWorkspace),
      (err: any) => err instanceof AppError && err.code === 'PATH_OUT_OF_BOUNDS'
    )

    // Verify registry syncedTargets did NOT change
    const registryAfter = await loadRegistry(tempWorkspace)
    assert.deepEqual(registryAfter.skills[skillName].syncedTargets, syncedBefore)
  })
})
