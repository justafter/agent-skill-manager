import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig, saveConfig } from '../../src/core/config.js'
import { loadRegistry, saveRegistry } from '../../src/core/registry.js'
import { planProjectSkillInject, applyProjectSkillInject } from '../../src/projects/inject.js'
import { pathExists } from '../../src/utils/fs.js'

describe('D7 Project Skill Injection', () => {
  let tempWorkspace: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let projDir: string

  before(async () => {
    tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'asm-inject-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = tempWorkspace
    process.env.HOME = tempWorkspace

    projDir = path.join(tempWorkspace, 'test-project')
    await mkdir(projDir, { recursive: true })

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
      projects: [
        {
          id: 'proj_test',
          name: 'Test Project',
          path: projDir,
          enabledAgents: ['claude'],
          allowProjectSkill: true,
          allowProjectRule: true
        }
      ]
    }
    await writeFile(
      path.join(tempWorkspace, 'skill-manager.config.json'),
      JSON.stringify(defaultConfig, null, 2)
    )

    // Save project config to user config as well so resolveRealpath works
    await saveConfig({ projects: defaultConfig.projects })

    // Create a local skill in library/skills/test-skill
    const localSkillDir = path.join(tempWorkspace, 'library', 'skills', 'test-skill')
    await mkdir(localSkillDir, { recursive: true })
    await writeFile(path.join(localSkillDir, 'SKILL.md'), '---\nname: test-skill\ndescription: testing\n---\nbody')
    await writeFile(path.join(localSkillDir, 'main.js'), 'console.log()')

    // Save to registry
    const registry = {
      version: 1,
      skills: {
        'test-skill': {
          name: 'test-skill',
          version: '0.1.0',
          description: 'testing',
          localPath: localSkillDir,
          checksum: 'sha256:dummyhash123',
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
          lastModified: new Date().toISOString(),
          syncedTargets: [],
          projectInstalls: []
        }
      }
    }
    await mkdir(path.dirname(path.join(tempWorkspace, 'library', 'registry.json')), { recursive: true })
    await saveRegistry(registry as any, tempWorkspace)
  })

  after(async () => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(tempWorkspace, { recursive: true, force: true })
  })

  it('can plan and inject skill into a project', async () => {
    const config = await loadConfig(tempWorkspace)
    const project = config.projects[0]
    const registry = await loadRegistry(tempWorkspace)
    const skill = registry.skills['test-skill']

    // 1. Generate plan
    const planResult = await planProjectSkillInject(project, skill, 'claude', tempWorkspace)
    assert.equal(planResult.summary.create, 1)
    assert.equal(planResult.summary.modify, 0)
    assert.equal(planResult.summary.skip, 0)

    const targetPath = planResult.plan.items[0].target
    assert.ok(targetPath.endsWith(path.join('.claude', 'skills', 'test-skill')))

    // 2. Apply plan
    const applyResult = await applyProjectSkillInject(planResult.plan.planId, 'proj_test', {
      allowManagedModify: true
    }, tempWorkspace)

    assert.equal(applyResult.applied.length, 1)

    // Check files exist in target directory
    assert.ok(await pathExists(path.join(targetPath, 'SKILL.md')))
    assert.ok(await pathExists(path.join(targetPath, 'main.js')))
    assert.ok(await pathExists(path.join(targetPath, '.skill-manager-deploy.json')))

    // Check deploy tag content
    const tagRaw = await readFile(path.join(targetPath, '.skill-manager-deploy.json'), 'utf8')
    const tag = JSON.parse(tagRaw)
    assert.equal(tag.projectId, 'proj_test')
    assert.equal(tag.skillName, 'test-skill')

    // Verify local registry was updated with projectInstalls
    const updatedRegistry = await loadRegistry(tempWorkspace)
    const installs = updatedRegistry.skills['test-skill'].projectInstalls
    assert.equal(installs.length, 1)
    assert.equal(installs[0].projectId, 'proj_test')
    assert.equal(installs[0].target, 'claude:project')
  })

  it('asserts path safety and rejects out-of-bounds writes', async () => {
    const config = await loadConfig(tempWorkspace)
    
    // 1. Non-existent project path
    const nonExistentProject = {
      ...config.projects[0],
      path: '/non/existent/path/for/project'
    }
    const registry = await loadRegistry(tempWorkspace)
    const skill = registry.skills['test-skill']

    await assert.rejects(async () => {
      await planProjectSkillInject(nonExistentProject, skill, 'claude', tempWorkspace)
    })

    // 2. Path traversal escaping project root
    const evilConfig = {
      backupDir: './backups',
      devDir: '',
      ruleTemplateDir: './library/rules',
      server: { host: '127.0.0.1', port: 47821 },
      targets: {
        claude: { enabled: true, userSkillPath: '', projectSkillPath: '../../outside-project-skills', projectRuleFile: '' },
        codex: { enabled: true, userSkillPath: '', projectSkillPath: '.agents/skills', projectRuleFile: '' },
        gemini: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' }
      },
      projects: config.projects
    }
    await writeFile(
      path.join(tempWorkspace, 'skill-manager.config.json'),
      JSON.stringify(evilConfig, null, 2)
    )

    await assert.rejects(async () => {
      await planProjectSkillInject(config.projects[0], skill, 'claude', tempWorkspace)
    }, /Refusing to write outside project/i)
  })
})
