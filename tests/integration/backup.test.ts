import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/core/config.js'
import { loadRegistry, saveRegistry } from '../../src/core/registry.js'
import { createManualBackup, listBackups } from '../../src/backup/create.js'
import { restoreBackup } from '../../src/backup/restore.js'
import { pathExists } from '../../src/utils/fs.js'
import { AppError } from '../../src/utils/errors.js'

describe('D4 Backup & Restore', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-backup-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    const defaultConfig = {
      backupDir: './backups',
      devDir: '',
      ruleTemplateDir: './library/rules',
      server: { host: '127.0.0.1', port: 47821 },
      targets: {
        claude: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
        codex: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
        gemini: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' }
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

  it('creates global backup and specific skill backup, lists backups, and restores registry/files', async () => {
    const skillName1 = 'skill-one'
    const skillName2 = 'skill-two'

    const skillDir1 = path.join(tempWorkspace, 'library', 'skills', skillName1)
    const skillDir2 = path.join(tempWorkspace, 'library', 'skills', skillName2)

    await mkdir(skillDir1, { recursive: true })
    await mkdir(skillDir2, { recursive: true })

    await writeFile(path.join(skillDir1, 'SKILL.md'), '---\nname: skill-one\nversion: 1.0.0\ndescription: one\n---\nCode One')
    await writeFile(path.join(skillDir2, 'SKILL.md'), '---\nname: skill-two\nversion: 1.0.0\ndescription: two\n---\nCode Two')

    const registry = await loadRegistry(tempWorkspace)
    registry.skills[skillName1] = {
      name: skillName1,
      version: '1.0.0',
      description: 'one',
      checksum: 'sha256:one' as any,
      localPath: skillDir1,
      syncedTargets: [],
      projectInstalls: []
    }
    registry.skills[skillName2] = {
      name: skillName2,
      version: '1.0.0',
      description: 'two',
      checksum: 'sha256:two' as any,
      localPath: skillDir2,
      syncedTargets: [],
      projectInstalls: []
    }
    await saveRegistry(registry, tempWorkspace)

    // 1. Create a global backup
    const indexGlobal = await createManualBackup(tempWorkspace, undefined, 'Initial state')
    assert.equal(indexGlobal.items.length, 2) // registry + skillsDir
    assert.ok(indexGlobal.backupId)

    // 2. Modify files and registry to test rollback
    await writeFile(path.join(skillDir1, 'SKILL.md'), '---\nname: skill-one\nversion: 2.0.0\n---\nModified code')
    // Add a leftover file to test safe copy delete on restore
    const leftoverFile = path.join(skillDir1, 'leftover.txt')
    await writeFile(leftoverFile, 'leftover content')

    const registryModified = await loadRegistry(tempWorkspace)
    registryModified.skills[skillName1].version = '2.0.0'
    registryModified.skills[skillName1].checksum = 'sha256:modified' as any
    await saveRegistry(registryModified, tempWorkspace)

    // 3. Create a specific backup of skill-two to check listBackups
    const indexSkillTwo = await createManualBackup(tempWorkspace, skillName2, 'Backup of two only')
    assert.equal(indexSkillTwo.items.length, 2) // registry + skill-two dir

    // 4. List backups and check desc order
    const list = await listBackups(tempWorkspace)
    assert.equal(list.length, 2)
    assert.equal(list[0].backupId, indexSkillTwo.backupId) // latest first
    assert.equal(list[1].backupId, indexGlobal.backupId)

    // 5. Restore to global state
    const restored = await restoreBackup(indexGlobal.backupId, tempWorkspace)
    assert.equal(restored.backupId, indexGlobal.backupId)

    // Check files rollbacked
    const content1 = await readFile(path.join(skillDir1, 'SKILL.md'), 'utf8')
    assert.ok(content1.includes('Code One'))
    assert.ok(!content1.includes('Modified code'))

    // Check leftover file deleted due to safe copy
    assert.ok(!(await pathExists(leftoverFile)))

    // Check registry rollbacked
    const registryRestored = await loadRegistry(tempWorkspace)
    assert.equal(registryRestored.skills[skillName1].version, '1.0.0')
    assert.equal(registryRestored.skills[skillName1].checksum, 'sha256:one')
  })

  it('fails to restore non-existent backup ID', async () => {
    await assert.rejects(
      restoreBackup('bk_non_existent_id', tempWorkspace),
      (err: any) => err instanceof AppError && err.code === 'BACKUP_NOT_FOUND'
    )
  })
})
