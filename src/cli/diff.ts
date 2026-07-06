import type { Command } from 'commander'
import { loadConfig } from '../core/config.js'
import { loadRegistry } from '../core/registry.js'
import { createAdapters } from '../adapters/registry.js'
import { diffDirectories } from '../rules/diff.js'
import { pathExists } from '../utils/fs.js'
import path from 'node:path'
import type { AgentId, Scope } from '../types/adapter.js'

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .argument('<skill-name>', 'Skill name')
    .argument('<target-key>', 'Target key, e.g. claude:user')
    .description('Compare local skill with target agent skill')
    .action(async (skillName: string, targetKey: string) => {
      try {
        const registry = await loadRegistry()
        const skill = registry.skills[skillName]
        if (!skill) {
          console.error(`Error: Skill "${skillName}" is not registered in local library.`)
          process.exit(1)
        }

        const parts = targetKey.split(':')
        if (parts.length !== 2) {
          console.error(`Error: Target key must be in the format "agent:scope" (e.g. claude:user).`)
          process.exit(1)
        }

        const agent = parts[0] as AgentId
        const scope = parts[1] as Scope

        if (!['claude', 'codex', 'gemini'].includes(agent) || !['user', 'project'].includes(scope)) {
          console.error(`Error: Invalid agent or scope in target key "${targetKey}".`)
          process.exit(1)
        }

        const config = await loadConfig()
        const adapters = createAdapters(config)
        const adapter = adapters[agent]

        if (!adapter) {
          console.error(`Error: No adapter found for agent "${agent}".`)
          process.exit(1)
        }

        if (scope !== 'user') {
          console.error(`Error: Scope "${scope}" is not supported yet (D2 only supports "user").`)
          process.exit(1)
        }

        const userSkillPath = adapter.getTargetPaths().userSkillPath
        if (!userSkillPath) {
          console.error(`Error: User skill path for agent "${agent}" is not configured.`)
          process.exit(1)
        }

        const sourceDir = path.join(process.cwd(), 'library', 'skills', skillName)
        const targetDir = path.join(userSkillPath, skillName)

        if (!(await pathExists(sourceDir))) {
          console.error(`Error: Source directory does not exist: ${sourceDir}`)
          process.exit(1)
        }

        if (!(await pathExists(targetDir))) {
          console.error(`Error: Target directory does not exist: ${targetDir}`)
          process.exit(1)
        }

        const { files } = await diffDirectories(sourceDir, targetDir)

        if (files.length === 0) {
          console.log(`No differences found between local library and ${targetKey}.`)
          return
        }

        console.log(`\nDifferences for "${skillName}" on ${targetKey}:`)
        console.log('='.repeat(80))

        for (const file of files) {
          if (file.status === 'added') {
            console.log(`[ADDED]   ${file.path} (exists in source, missing in target)`)
          } else if (file.status === 'removed') {
            console.log(`[REMOVED] ${file.path} (missing in source, exists in target)`)
          } else if (file.status === 'changed') {
            console.log(`[CHANGED] ${file.path}`)
            if (file.patch) {
              console.log('-'.repeat(40))
              console.log(file.patch)
              console.log('-'.repeat(40))
            }
          }
        }
      } catch (error) {
        console.error('Diff failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
