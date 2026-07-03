import type { Command } from 'commander'

export function registerWatchCommand(program: Command): void {
  program.command('watch').description('Start watch mode').action(() => {
    console.log('Watch mode is not implemented yet.')
  })
}
