import type { Command } from 'commander'
import { planSync } from '../sync/engine.js'

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .argument('<source>', 'Source skill path')
    .argument('<target>', 'Target skill path')
    .option('--dry-run', 'Only create a plan', true)
    .description('Plan a skill sync')
    .action((source: string, target: string) => {
      console.log(JSON.stringify(planSync(source, target), null, 2))
    })
}
