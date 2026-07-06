import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { importSkill } from '../../src/core/import.js'
import { loadRegistry } from '../../src/core/registry.js'
import { checksumDirectory } from '../../src/utils/hash.js'
import { pathExists } from '../../src/utils/fs.js'
import { AppError } from '../../src/utils/errors.js'

describe('D1 Skill Import & Registry', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined

  before(async () => {
    // 1. Create temporary workspace to act as repo root
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-import-test-'))

    // 2. Redirect config folder to temp workspace
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    // 3. Write default skill-manager.config.json in temp workspace
    const defaultConfig = {
      backupDir: './backups',
      devDir: '',
      ruleTemplateDir: './library/rules',
      server: { host: '127.0.0.1', port: 47821 },
      targets: {
        claude: {
          enabled: true,
          userSkillPath: path.join(tempWorkspace, 'claude-skills'),
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
      projects: []
    }
    await writeFile(
      path.join(tempWorkspace, 'skill-manager.config.json'),
      JSON.stringify(defaultConfig, null, 2)
    )

    // Ensure library directories exist in temp workspace
    await mkdir(path.join(tempWorkspace, 'library', 'skills'), { recursive: true })
    await mkdir(path.join(tempWorkspace, 'library', 'rules'), { recursive: true })
  })

  after(async () => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(tempWorkspace, { recursive: true, force: true })
  })

  it('imports a valid skill successfully', async () => {
    // 1. Create a dummy skill folder
    const skillSourcePath = path.join(tempWorkspace, 'test-skill')
    await mkdir(skillSourcePath, { recursive: true })
    await mkdir(path.join(skillSourcePath, 'scripts'), { recursive: true })

    const skillMdContent = `---
name: test-skill
version: 1.2.3
description: "A test skill for automation"
---
# Test Skill Instructions
`
    await writeFile(path.join(skillSourcePath, 'SKILL.md'), skillMdContent)
    await writeFile(path.join(skillSourcePath, 'scripts', 'test.sh'), 'echo "hello"')

    // 2. Import the skill
    const result = await importSkill(skillSourcePath, {}, tempWorkspace)
    assert.equal(result.status, 'imported')
    assert.equal(result.skill.name, 'test-skill')
    assert.equal(result.skill.version, '1.2.3')
    assert.ok(result.skill.hasScripts)
    assert.ok(!result.skill.hasReferences)

    // 3. Verify files copied to canonical source
    const canonicalPath = path.join(tempWorkspace, 'library', 'skills', 'test-skill')
    assert.ok(await pathExists(canonicalPath))
    assert.ok(await pathExists(path.join(canonicalPath, 'SKILL.md')))
    assert.ok(await pathExists(path.join(canonicalPath, 'scripts', 'test.sh')))

    // 4. Verify registry.json is updated
    const registry = await loadRegistry(tempWorkspace)
    assert.ok(registry.skills['test-skill'])
    assert.equal(registry.skills['test-skill'].version, '1.2.3')
    assert.equal(registry.skills['test-skill'].localPath, skillSourcePath)
    assert.equal(registry.skills['test-skill'].checksum, await checksumDirectory(canonicalPath))
  })

  it('skips import when identical checksum exists', async () => {
    const skillSourcePath = path.join(tempWorkspace, 'test-skill')
    const result = await importSkill(skillSourcePath, {}, tempWorkspace)
    assert.equal(result.status, 'skipped')
  })

  it('rejects duplicate import if checksum is different and no options provided', async () => {
    // Modify source skill files to change checksum
    const skillSourcePath = path.join(tempWorkspace, 'test-skill')
    await writeFile(path.join(skillSourcePath, 'scripts', 'test.sh'), 'echo "modified"')

    await assert.rejects(
      importSkill(skillSourcePath, {}, tempWorkspace),
      (err: any) => err instanceof AppError && err.code === 'SKILL_ALREADY_EXISTS'
    )
  })

  it('skips duplicate import if skip options is provided', async () => {
    const skillSourcePath = path.join(tempWorkspace, 'test-skill')
    const result = await importSkill(skillSourcePath, { skip: true }, tempWorkspace)
    assert.equal(result.status, 'skipped')
  })

  it('forces overwrite with backup and safe copy when force option is provided', async () => {
    const skillSourcePath = path.join(tempWorkspace, 'test-skill')
    
    // Write an extra file in the old canonical folder to test "safe copy" cleanup
    const extraFileInCanonical = path.join(tempWorkspace, 'library', 'skills', 'test-skill', 'leftover.txt')
    await writeFile(extraFileInCanonical, 'leftover file')

    // Perform forced import
    const result = await importSkill(skillSourcePath, { force: true }, tempWorkspace)
    assert.equal(result.status, 'updated')
    assert.ok(result.backupId)

    // Verify leftover file is removed due to physical deletion of target dir before copy
    assert.ok(!(await pathExists(extraFileInCanonical)))
    assert.equal(result.skill.checksum, await checksumDirectory(path.join(tempWorkspace, 'library', 'skills', 'test-skill')))

    // Verify backup created under backups/bk_*
    const backupIndexFile = path.join(tempWorkspace, 'backups', result.backupId!, 'index.json')
    assert.ok(await pathExists(backupIndexFile))

    const backupIndex = JSON.parse(await readFile(backupIndexFile, 'utf8'))
    assert.equal(backupIndex.backupId, result.backupId)

    // Verify old registry snapshot backed up
    const backupRegistry = path.join(tempWorkspace, 'backups', result.backupId!, 'registry-snapshot.json')
    assert.ok(await pathExists(backupRegistry))

    // Verify old skill folder backed up
    const backupSkillDir = path.join(tempWorkspace, 'backups', result.backupId!, 'library', 'skills', 'test-skill')
    assert.ok(await pathExists(backupSkillDir))
    assert.ok(await pathExists(path.join(backupSkillDir, 'leftover.txt'))) // Old code had leftover
  })

  it('fails if SKILL.md name does not match folder name', async () => {
    const skillSourcePath = path.join(tempWorkspace, 'invalid-skill')
    await mkdir(skillSourcePath, { recursive: true })

    const skillMdContent = `---
name: name-mismatch
version: 1.0.0
description: "A mismatching name skill"
---
`
    await writeFile(path.join(skillSourcePath, 'SKILL.md'), skillMdContent)

    await assert.rejects(
      importSkill(skillSourcePath, {}, tempWorkspace),
      (err: any) => err instanceof Error && err.message.includes('name must match directory name')
    )
  })
})
