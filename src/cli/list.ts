import type { Command } from 'commander'
import { loadRegistry } from '../core/registry.js'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List registered skills')
    .action(async () => {
      try {
        const registry = await loadRegistry()
        const skills = Object.values(registry.skills)

        if (skills.length === 0) {
          console.log('No skills registered.')
          return
        }

        console.log(`\nRegistered Skills (${skills.length}):`)
        console.log('='.repeat(80))
        for (const skill of skills) {
          console.log(`Name:         ${skill.name}`)
          console.log(`Version:      ${skill.version}`)
          console.log(`Description:  ${skill.description}`)
          console.log(`Library Path: library/skills/${skill.name}`)
          console.log(`Dev Path:     ${skill.localPath}`)
          console.log(`Checksum:     ${skill.checksum.slice(0, 19)}...`)
          console.log(`Synced To:    ${skill.syncedTargets?.join(', ') || '(none)'}`)
          console.log('-'.repeat(80))
        }
      } catch (error) {
        console.error('Failed to list skills:', (error as Error).message)
        process.exit(1)
      }
    })
}
