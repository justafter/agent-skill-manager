import type { Command } from 'commander'

export function registerRestoreCommand(program: Command): void {
  program.command('restore').argument('<backup-id>').description('Restore from backup').action((backupId: string) => {
    console.log(`Restore is not implemented yet: ${backupId}`)
  })
}
