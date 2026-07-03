import type { Command } from 'commander'

export function registerBackupCommand(program: Command): void {
  program.command('backup').description('Create a backup').action(() => {
    console.log('Backup is not implemented yet.')
  })
}
