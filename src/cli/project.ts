import type { Command } from 'commander'
import path from 'node:path'
import { loadConfig, saveConfig } from '../core/config.js'
import { loadRegistry } from '../core/registry.js'
import { planProjectSkillInject, applyProjectSkillInject } from '../projects/inject.js'
import { scanProject } from '../projects/scanner.js'
import { buildRemovePreview, removeProject } from '../projects/remove.js'
import { pathExists } from '../utils/fs.js'
import type { AgentId } from '../types/adapter.js'
import { planRuleSync } from '../rules/plan.js'
import { applyRuleSync } from '../rules/apply.js'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export function registerProjectCommand(program: Command): void {
  const project = program.command('project').description('Manage project workspaces')

  // 1. asm project list
  project
    .command('list')
    .description('List registered projects')
    .action(async () => {
      try {
        const config = await loadConfig()
        const projects = config.projects || []

        if (projects.length === 0) {
          console.log('No projects registered.')
          return
        }

        console.log(`\nRegistered Projects (${projects.length}):`)
        console.log('='.repeat(80))
        for (const p of projects) {
          console.log(`ID:             ${p.id}`)
          console.log(`Name:           ${p.name}`)
          console.log(`Path:           ${p.path}`)
          console.log(`Enabled Agents: ${p.enabledAgents.join(', ')}`)
          console.log('-'.repeat(80))
        }
      } catch (error) {
        console.error('Failed to list projects:', (error as Error).message)
        process.exit(1)
      }
    })

  // 2. asm project add <name> <path>
  project
    .command('add')
    .argument('<name>', 'Project name')
    .argument('<path>', 'Project root path')
    .description('Register a project')
    .action(async (name: string, projectPath: string) => {
      try {
        const config = await loadConfig()
        const absPath = path.resolve(projectPath)

        if (!(await pathExists(absPath))) {
          console.error(`Error: Project path does not exist: ${absPath}`)
          process.exit(1)
        }

        // Check duplicate path
        const duplicate = config.projects.find((p) => path.resolve(p.path) === absPath)
        if (duplicate) {
          console.error(`Error: Project is already registered with ID: ${duplicate.id}`)
          process.exit(1)
        }

        // Generate unique project ID
        const id = `proj_${Math.random().toString(36).substring(2, 10)}`

        // Detect enabled agents based on folder structures
        const detectedAgents: AgentId[] = []
        // Note: gemini shares `.agents` with codex at the project level,
        // so we dedupe by agent (each agent appears at most once).
        const agentsToCheck: { agent: AgentId; folder: string }[] = [
          { agent: 'claude', folder: '.claude' },
          { agent: 'codex', folder: '.agents' },
          { agent: 'gemini', folder: '.agents' },
        ]
        const detectedAgentsSet = new Set<AgentId>()
        for (const check of agentsToCheck) {
          if (detectedAgentsSet.has(check.agent)) continue
          if (await pathExists(path.join(absPath, check.folder))) {
            detectedAgents.push(check.agent)
            detectedAgentsSet.add(check.agent)
          }
        }

        // Fallback to config targets if none detected
        const enabledAgents =
          detectedAgents.length > 0
            ? detectedAgents
            : (Object.keys(config.targets) as AgentId[]).filter((a) => config.targets[a]?.enabled)

        const newProject = {
          id,
          name,
          path: absPath,
          enabledAgents,
          allowProjectSkill: true,
          allowProjectRule: true,
        }

        const updatedProjects = [...config.projects, newProject]
        await saveConfig({ projects: updatedProjects })

        console.log(`[+] Project "${name}" registered successfully.`)
        console.log(`    ID:             ${id}`)
        console.log(`    Path:           ${absPath}`)
        console.log(`    Enabled Agents: ${enabledAgents.join(', ')}`)
      } catch (error) {
        console.error('Failed to add project:', (error as Error).message)
        process.exit(1)
      }
    })

  // 3. asm project scan <project-id>
  project
    .command('scan')
    .argument('<project-id>', 'Project ID')
    .description('Scan project workspace for agent skills and rules')
    .action(async (projectId: string) => {
      try {
        const config = await loadConfig()
        const p = config.projects.find((proj) => proj.id === projectId)
        if (!p) {
          console.error(`Error: Project not found: ${projectId}`)
          process.exit(1)
        }

        const scanResult = await scanProject(p)

        console.log(`\n=== Project Scan [${p.name}] ===`)
        console.log(`ID:             ${p.id}`)
        console.log(`Path:           ${p.path}`)
        console.log(`Skill Dirs:     ${scanResult.skillDirs.length > 0 ? scanResult.skillDirs.join(', ') : '(none)'}`)
        console.log(`Rule Files:     ${scanResult.ruleFiles.length > 0 ? scanResult.ruleFiles.join(', ') : '(none)'}`)
        console.log('='.repeat(80))
      } catch (error) {
        console.error('Project scan failed:', (error as Error).message)
        process.exit(1)
      }
    })

  // 4. asm project inject <project-id> <skill-name> --agent <agent>
  project
    .command('inject')
    .argument('<project-id>', 'Project ID')
    .argument('<skill-name>', 'Skill name')
    .requiredOption('--agent <agent>', 'Agent name, e.g. claude, codex, gemini')
    .option('--dry-run', 'Generate and show plan without executing', false)
    .option('--allow-managed-modify', 'Allow overwriting managed skill files in project that have changed')
    .description('Inject/sync a skill to project workspace')
    .action(
      async (
        projectId: string,
        skillName: string,
        options: { agent: string; dryRun: boolean; allowManagedModify?: boolean },
      ) => {
        try {
          const config = await loadConfig()
          const p = config.projects.find((proj) => proj.id === projectId)
          if (!p) {
            console.error(`Error: Project not found: ${projectId}`)
            process.exit(1)
          }

          const registry = await loadRegistry()
          const skill = registry.skills[skillName]
          if (!skill) {
            console.error(`Error: Skill not found in local library: ${skillName}`)
            process.exit(1)
          }

          const agent = options.agent as AgentId
          if (!['claude', 'codex', 'gemini'].includes(agent)) {
            console.error(`Error: Invalid agent: ${agent}. Supported: claude, codex, gemini`)
            process.exit(1)
          }

          const planResult = await planProjectSkillInject(p, skill, agent)

          console.log(`\n=== Project Inject Plan [${planResult.plan.planId}] ===`)
          console.log(`Project:  ${p.name} (${p.id})`)
          console.log(`Skill:    ${skillName}`)
          console.log(`Agent:    ${agent}`)
          console.log(`Summary:`)
          console.log(`  - Create:   ${planResult.summary.create}`)
          console.log(`  - Modify:   ${planResult.summary.modify}`)
          console.log(`  - Skip:     ${planResult.summary.skip}`)
          console.log(`  - Conflict: ${planResult.summary.conflict}`)
          console.log(``)

          for (const item of planResult.plan.items) {
            console.log(`  [${item.kind.toUpperCase()}] -> ${item.target}`)
          }
          console.log(``)

          if (options.dryRun) {
            console.log(`Dry-run mode. Inject plan was NOT applied.`)
            return
          }

          if (planResult.summary.create === 0 && planResult.summary.modify === 0) {
            console.log(`No changes to apply.`)
            return
          }

          if (planResult.summary.conflict > 0 && !options.allowManagedModify) {
            console.error(
              `Error: Conflict detected. Please resolve conflict or specify --allow-managed-modify to overwrite.`,
            )
            process.exit(1)
          }

          const applyResult = await applyProjectSkillInject(planResult.plan.planId, projectId, {
            allowManagedModify: options.allowManagedModify,
          })

          console.log(`[+] Skill injected successfully.`)
          console.log(`    Applied: ${applyResult.applied.length} items`)
          if (applyResult.skipped.length > 0) {
            console.log(`    Skipped: ${applyResult.skipped.length} items`)
          }
        } catch (error) {
          console.error('Project injection failed:', (error as Error).message)
          process.exit(1)
        }
      },
    )

  // 5. asm project plan-rules <project-id> --agent <agent>
  project
    .command('plan-rules')
    .argument('<project-id>', 'Project ID')
    .requiredOption('--agent <agent>', 'Agent name, e.g. claude, codex, gemini')
    .description('Show rule template differences for a project')
    .action(async (projectId: string, options: { agent: string }) => {
      try {
        const config = await loadConfig()
        const p = config.projects.find((proj) => proj.id === projectId)
        if (!p) {
          console.error(`Error: Project not found: ${projectId}`)
          process.exit(1)
        }

        const agent = options.agent as AgentId
        if (!['claude', 'codex', 'gemini'].includes(agent)) {
          console.error(`Error: Invalid agent: ${agent}. Supported: claude, codex, gemini`)
          process.exit(1)
        }

        const plan = await planRuleSync(p, agent)
        console.log(`\n=== Rule Sync Plan [${p.name}] ===`)
        console.log(`Target path:  ${plan.targetPath}`)
        console.log(`Status:       ${plan.status}`)
        console.log(`Patch Diff:`)
        console.log(plan.patch || '(No difference)')
      } catch (error) {
        console.error('Plan rules failed:', (error as Error).message)
        process.exit(1)
      }
    })

  // 6. asm project push-rules <project-id> --agent <agent> [--mode block|overwrite]
  project
    .command('push-rules')
    .argument('<project-id>', 'Project ID')
    .requiredOption('--agent <agent>', 'Agent name, e.g. claude, codex, gemini')
    .option('--mode <mode>', 'Sync mode: block, overwrite', 'block')
    .description('Push rules template to project rules file')
    .action(async (projectId: string, options: { agent: string; mode: string }) => {
      try {
        const config = await loadConfig()
        const p = config.projects.find((proj) => proj.id === projectId)
        if (!p) {
          console.error(`Error: Project not found: ${projectId}`)
          process.exit(1)
        }

        const agent = options.agent as AgentId
        if (!['claude', 'codex', 'gemini'].includes(agent)) {
          console.error(`Error: Invalid agent: ${agent}. Supported: claude, codex, gemini`)
          process.exit(1)
        }

        const mode = options.mode as 'block' | 'overwrite'
        if (!['block', 'overwrite'].includes(mode)) {
          console.error(`Error: Invalid mode: ${mode}. Supported: block, overwrite`)
          process.exit(1)
        }

        await applyRuleSync(projectId, agent, mode)
        console.log(`[+] Rules template pushed successfully to ${p.name}`)
      } catch (error) {
        console.error('Push rules failed:', (error as Error).message)
        process.exit(1)
      }
    })

  // 7. asm project pull-rules <project-id> --agent <agent>
  project
    .command('pull-rules')
    .argument('<project-id>', 'Project ID')
    .requiredOption('--agent <agent>', 'Agent name, e.g. claude, codex, gemini')
    .description('Pull project rules and save as local template')
    .action(async (projectId: string, options: { agent: string }) => {
      try {
        const config = await loadConfig()
        const p = config.projects.find((proj) => proj.id === projectId)
        if (!p) {
          console.error(`Error: Project not found: ${projectId}`)
          process.exit(1)
        }

        const agent = options.agent as AgentId
        if (!['claude', 'codex', 'gemini'].includes(agent)) {
          console.error(`Error: Invalid agent: ${agent}. Supported: claude, codex, gemini`)
          process.exit(1)
        }

        await applyRuleSync(projectId, agent, 'pull')
        console.log(`[+] Rules pulled successfully from ${p.name} to local ${agent} template.`)
      } catch (error) {
        console.error('Pull rules failed:', (error as Error).message)
        process.exit(1)
      }
    })

  // 8. asm project remove <project-id> [--yes]
  project
    .command('remove')
    .argument('<project-id>', 'Project ID')
    .option('--yes', 'Skip interactive confirmation (preview is always printed)', false)
    .description('Unregister a project (de-register only; no files are deleted)')
    .action(async (projectId: string, options: { yes: boolean }) => {
      try {
        const config = await loadConfig()
        const target = (config.projects ?? []).find((proj) => proj.id === projectId)
        if (!target) {
          console.error(`Error: Project not found: ${projectId}`)
          process.exit(1)
        }

        const preview = await buildRemovePreview(target)

        // Preview (always printed).
        console.log(`\n=== 项目移除影响预览 [${preview.project.name}] (${preview.project.id}) ===\n`)
        console.log(`待移除注册记录:`)
        console.log(`  ID:   ${preview.project.id}`)
        console.log(`  Name: ${preview.project.name}`)
        console.log(`  Path: ${preview.project.path}`)

        console.log(`\n项目级 Skill 安装（不会被删除，仅解除管理）:`)
        if (preview.skillInstalls.length === 0) {
          console.log(`  (无)`)
        } else {
          for (const s of preview.skillInstalls) {
            console.log(`  [${s.agent}] ${s.skill.padEnd(28)} ${s.absolutePath}  ${s.exists ? '存在' : '缺失'}`)
          }
        }

        console.log(`\n项目级规则文件（不会被删除，仅解除管理）:`)
        if (preview.ruleFiles.length === 0) {
          console.log(`  (无)`)
        } else {
          for (const r of preview.ruleFiles) {
            console.log(`  [${r.agent}] ${r.file.padEnd(12)} ${r.absolutePath}  ${r.exists ? '存在' : '缺失'}`)
          }
        }

        console.log(``)
        console.log(`⚠ 以下文件不会被删除，移除后仅不再受本工具管理。`)
        console.log(`⚠ 移除前将自动备份当前 config.json 到 backups/config-snapshots/。`)

        if (!options.yes) {
          const rl = createInterface({ input, output })
          try {
            const answer = (await rl.question(`\n确认移除? [y/N]: `)).trim().toLowerCase()
            if (answer !== 'y' && answer !== 'yes') {
              console.log('已取消。')
              return
            }
          } finally {
            rl.close()
          }
        } else {
          console.log(`\n(--yes 已指定，跳过交互式确认)`)
        }

        const result = await removeProject(projectId, true)
        console.log(`[+] 已解除注册 ${projectId}。`)
        console.log(`    备份已保存至: ${result.backupPath}`)
      } catch (error) {
        console.error('Project removal failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
