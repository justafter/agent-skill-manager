import type { Command } from 'commander'
import { restoreBackup } from '../backup/restore.js'

export function registerRestoreCommand(program: Command): void {
  program
    .command('restore')
    .argument('<backup-id>', 'Backup ID to restore from')
    .description('Restore registry and files from backup')
    .action(async (backupId: string) => {
      try {
        console.log(`[*] Restoring from backup: ${backupId}...`)
        const index = await restoreBackup(backupId)
        console.log(`[+] Restore completed successfully.`)
        console.log(`    Restored Items:`)
        for (const item of index.items) {
          console.log(`      - [${item.type.toUpperCase()}] restored to ${item.originalPath}`)
        }
      } catch (error) {
        console.error('Restore failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
