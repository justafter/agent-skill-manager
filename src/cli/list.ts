import type { Command } from 'commander'

export function registerListCommand(program: Command): void {
  program.command('list').description('List registered skills').action(() => {
    console.log('Skill listing is not implemented yet.')
  })
}
