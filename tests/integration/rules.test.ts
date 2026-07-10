import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/core/config.js'
import { planRuleSync } from '../../src/rules/plan.js'
import { applyRuleSync } from '../../src/rules/apply.js'
import { pathExists } from '../../src/utils/fs.js'
import { importRuleTemplate } from '../../src/rules/template.js'

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
      'Local authority rules\n',
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
          ruleTemplates: {
            claude: 'CLAUDE.md',
          },
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

  it('handles rules lifecycle: create, identical, changed, overwrite, and pull', async () => {
    const config = await loadConfig(tempWorkspace)
    const project = config.projects[0]
    const targetFile = path.join(projDir, 'CLAUDE.md')

    // 1. Initially rules file is missing -> status should be 'create'
    let plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'create')
    assert.ok(plan.patch.includes('+Local authority rules'))

    // 2. Apply rules (push/overwrite mode)
    await applyRuleSync('proj_test', 'claude', 'overwrite', tempWorkspace)
    assert.ok(await pathExists(targetFile))
    let content = await readFile(targetFile, 'utf8')
    assert.ok(content.includes('Local authority rules'))

    // 3. Now it is written -> status should be 'identical'
    plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'identical')

    // 4. Modify content in project -> status should be 'changed'
    const modifiedContent = 'User modified rules\n'
    await writeFile(targetFile, modifiedContent, 'utf8')

    plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'changed')

    // 5. Apply overwrite -> file is completely replaced with template content
    await applyRuleSync('proj_test', 'claude', 'overwrite', tempWorkspace)
    content = await readFile(targetFile, 'utf8')
    assert.equal(content.trim(), 'Local authority rules')

    // 6. Pull from project back to local template
    // Let's modify block in project
    await writeFile(targetFile, 'New pulled rules\n', 'utf8')
    await applyRuleSync('proj_test', 'claude', 'pull', tempWorkspace)

    // Local template should be updated with the entire content
    const templateContent = await readFile(path.join(templateDir, 'claude', 'CLAUDE.md'), 'utf8')
    assert.equal(templateContent.trim(), 'New pulled rules')
  })

  it('supports custom templates per project with name translation', async () => {
    // 1. Create a custom template file
    const customTplPath = path.join(templateDir, 'claude', 'react-frontend.md')
    await writeFile(
      customTplPath,
      'React frontend rules authority\n',
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
    const targetFile = path.join(projDir, 'CLAUDE.md')

    // Clean up project rule file
    if (await pathExists(targetFile)) {
      await rm(targetFile)
    }

    // 3. Plan rule sync -> status 'create', expected content should be react-frontend.md content
    let plan = await planRuleSync(project, 'claude', tempWorkspace)
    assert.equal(plan.status, 'create')
    assert.ok(plan.patch.includes('+React frontend rules authority'))

    // 4. Apply rules -> writes to CLAUDE.md (translation)
    await applyRuleSync('proj_custom_tpl', 'claude', 'overwrite', tempWorkspace)
    assert.ok(await pathExists(targetFile))
    let content = await readFile(targetFile, 'utf8')
    assert.ok(content.includes('React frontend rules authority'))

    // 5. Pull changes back -> updates react-frontend.md (translation)
    await writeFile(
      targetFile,
      'Evolved react frontend rules\n',
      'utf8',
    )
    await applyRuleSync('proj_custom_tpl', 'claude', 'pull', tempWorkspace)

    const updatedTplContent = await readFile(customTplPath, 'utf8')
    assert.equal(updatedTplContent.trim(), 'Evolved react frontend rules')
  })

  it('supports importing external rule templates', async () => {
    const extFilePath1 = path.join(tempWorkspace, 'external-rules-1.md')

    // 1. 普通文件
    await writeFile(extFilePath1, '# External Rules 1\nSome rule content\n', 'utf8')

    // 导入普通文件
    const res1 = await importRuleTemplate(templateDir, extFilePath1, 'claude', 'imported-1.md')
    assert.equal(res1.success, true)
    assert.ok(await pathExists(res1.path))
    const importedContent1 = await readFile(res1.path, 'utf8')
    // 应该是原样导入，不再被包裹托管块标记
    assert.ok(!importedContent1.includes('<!-- BEGIN AgentSkillManager:claude -->'))
    assert.ok(importedContent1.includes('# External Rules 1'))

    // 异常流程：源路径存在
    await assert.rejects(
      importRuleTemplate(templateDir, path.join(tempWorkspace, 'non-existent.md'), 'claude', 'imported-3.md'),
      /源规则文件不存在/,
    )

    // 异常流程：目标模板已存在
    await assert.rejects(
      importRuleTemplate(templateDir, extFilePath1, 'claude', 'imported-1.md'),
      /规则模板库中已存在同名模板/,
    )
  })
})
