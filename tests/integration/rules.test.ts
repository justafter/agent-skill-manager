import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/core/config.js'
import { planRuleSync } from '../../src/rules/plan.js'
import { applyRuleSync } from '../../src/rules/apply.js'
import { pathExists } from '../../src/utils/fs.js'

describe('D8 Rule Templates Sync', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let projDir: string
  let templateDir: string

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-rules-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    projDir = path.join(tempWorkspace, 'test-project')
    await mkdir(projDir, { recursive: true })

    templateDir = path.join(tempWorkspace, 'library', 'rules')
    await mkdir(path.join(templateDir, 'claude'), { recursive: true })

    // Write a dummy Claude rules template
    await writeFile(
      path.join(templateDir, 'claude', 'CLAUDE.md'),
      '<!-- BEGIN AgentSkillManager:claude -->\nLocal authority rules\n<!-- END AgentSkillManager:claude -->\n',
      'utf8',
    )

    const defaultConfig = {
      backupDir: './backups',
      devDir: '',
      ruleTemplateDir: './library/rules',
      server: { host: '127.0.0.1', port: 47821 },
      targets: {
        claude: { enabled: true, userSkillPath: '', projectSkillPath: '.claude/skills', projectRuleFile: 'CLAUDE.md' },
        codex: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
        gemini: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
      },
      projects: [
        {
          id: 'proj_test',
          name: 'Test Project',
          path: projDir,
          enabledAgents: ['claude'],
          allowProjectSkill: true,
          allowProjectRule: true,
        },
      ],
    }
    await writeFile(path.join(tempWorkspace, 'skill-manager.config.json'), JSON.stringify(defaultConfig, null, 2))
  })

  after(async () => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(tempWorkspace, { recursive: true, force: true })
  })

  it('handles rules lifecycle: create, identical, block, conflict, overwrite, and pull', async () => {
    const config = await loadConfig(tempWorkspace)
    const project = config.projects[0]
    const targetFile = path.join(projDir, 'CLAUDE.md')

    // 1. Initially rules file is missing -> status should be 'create'
    let plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'create')
    assert.ok(plan.patch.includes('+Local authority rules'))

    // 2. Apply rules in block mode
    await applyRuleSync('proj_test', 'claude', 'block', tempWorkspace)
    assert.ok(await pathExists(targetFile))
    let content = await readFile(targetFile, 'utf8')
    assert.ok(content.includes('Local authority rules'))

    // 3. Now it is written -> status should be 'identical'
    plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'identical')

    // 4. Modify block content in project -> status should be 'block'
    const modifiedContent =
      '<!-- BEGIN AgentSkillManager:claude -->\nUser modified rules\n<!-- END AgentSkillManager:claude -->\n'
    const userCustomComment = '# Custom Project Rules\n'
    await writeFile(targetFile, userCustomComment + modifiedContent, 'utf8')

    plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'block')

    // 5. Apply rules in block mode -> block is replaced but userCustomComment must be preserved!
    await applyRuleSync('proj_test', 'claude', 'block', tempWorkspace)
    content = await readFile(targetFile, 'utf8')
    assert.ok(content.includes('Local authority rules'))
    assert.ok(content.includes('# Custom Project Rules')) // Preserved!
    assert.ok(!content.includes('User modified rules'))

    // 6. Delete managed block but leave the file -> status should be 'conflict'
    await writeFile(targetFile, '# Custom Project Rules\nSome unmanaged text', 'utf8')
    plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'conflict')

    // 7. Apply overwrite -> file is completely replaced with template content
    await applyRuleSync('proj_test', 'claude', 'overwrite', tempWorkspace)
    content = await readFile(targetFile, 'utf8')
    assert.equal(
      content.trim(),
      '<!-- BEGIN AgentSkillManager:claude -->\nLocal authority rules\n<!-- END AgentSkillManager:claude -->',
    )

    // 8. Pull from project back to local template
    // Let's modify block in project
    await writeFile(
      targetFile,
      '<!-- BEGIN AgentSkillManager:claude -->\nNew pulled rules\n<!-- END AgentSkillManager:claude -->\n',
      'utf8',
    )
    await applyRuleSync('proj_test', 'claude', 'pull', tempWorkspace)

    // Local template should be updated
    const templateContent = await readFile(path.join(templateDir, 'claude', 'CLAUDE.md'), 'utf8')
    assert.ok(templateContent.includes('New pulled rules'))
  })

  it('supports custom templates per project with name translation', async () => {
    // 1. Create a custom template file
    const customTplPath = path.join(templateDir, 'claude', 'react-frontend.md')
    await writeFile(
      customTplPath,
      '<!-- BEGIN AgentSkillManager:claude -->\nReact frontend rules authority\n<!-- END AgentSkillManager:claude -->\n',
      'utf8',
    )

    // 2. Configure a project to bind to this custom template
    const config = await loadConfig(tempWorkspace)
    const project = {
      ...config.projects[0],
      id: 'proj_custom_tpl',
      ruleTemplates: {
        claude: 'react-frontend.md',
      },
    }

    // Write new config with the custom project
    const newConfig = {
      ...config,
      projects: [project],
    }
    await writeFile(path.join(tempWorkspace, 'skill-manager.config.json'), JSON.stringify(newConfig, null, 2))

    // Refresh memory config
    const refreshedConfig = await loadConfig(tempWorkspace)
    const targetFile = path.join(projDir, 'CLAUDE.md')

    // Clean up project rule file
    if (await pathExists(targetFile)) {
      await rm(targetFile)
    }

    // 3. Plan rule sync -> status 'create', expected content should be react-frontend.md content
    let plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'create')
    assert.ok(plan.patch.includes('+React frontend rules authority'))

    // 4. Apply rules in block mode -> writes to CLAUDE.md (translation)
    await applyRuleSync('proj_custom_tpl', 'claude', 'block', tempWorkspace)
    assert.ok(await pathExists(targetFile))
    let content = await readFile(targetFile, 'utf8')
    assert.ok(content.includes('React frontend rules authority'))

    // 5. Pull changes back -> updates react-frontend.md (translation)
    await writeFile(
      targetFile,
      '<!-- BEGIN AgentSkillManager:claude -->\nEvolved react frontend rules\n<!-- END AgentSkillManager:claude -->\n',
      'utf8',
    )
    await applyRuleSync('proj_custom_tpl', 'claude', 'pull', tempWorkspace)

    const updatedTplContent = await readFile(customTplPath, 'utf8')
    assert.ok(updatedTplContent.includes('Evolved react frontend rules'))
  })
})
