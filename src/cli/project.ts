import type { Command } from 'commander'
import path from 'node:path'
import { loadConfig, saveConfig } from '../core/config.js'
import { loadRegistry } from '../core/registry.js'
import { planProjectSkillInject, applyProjectSkillInject } from '../projects/inject.js'
import { scanProject } from '../projects/scanner.js'
import { pathExists } from '../utils/fs.js'
import type { AgentId } from '../types/adapter.js'

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
        const agentsToCheck: { agent: AgentId; folder: string }[] = [
          { agent: 'claude', folder: '.claude' },
          { agent: 'codex', folder: '.agents' },
          { agent: 'gemini', folder: '.gemini' }
        ]

        for (const check of agentsToCheck) {
          if (await pathExists(path.join(absPath, check.folder))) {
            detectedAgents.push(check.agent)
          }
        }

        // Fallback to config targets if none detected
        const enabledAgents = detectedAgents.length > 0
          ? detectedAgents
          : (Object.keys(config.targets) as AgentId[]).filter((a) => config.targets[a]?.enabled)

        const newProject = {
          id,
          name,
          path: absPath,
          enabledAgents,
          allowProjectSkill: true,
          allowProjectRule: true
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
    .action(async (projectId: string, skillName: string, options: { agent: string; dryRun: boolean; allowManagedModify?: boolean }) => {
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
          console.error(`Error: Conflict detected. Please resolve conflict or specify --allow-managed-modify to overwrite.`)
          process.exit(1)
        }

        const applyResult = await applyProjectSkillInject(planResult.plan.planId, projectId, {
          allowManagedModify: options.allowManagedModify
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
    })
}
