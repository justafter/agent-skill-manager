import type { Command } from 'commander'
import { createManualBackup, listBackups } from '../backup/create.js'

export function registerBackupCommand(program: Command): void {
  program
    .command('backup')
    .description('Manage backups')
    .option('-s, --skill <skill-name>', 'Backup only a specific skill')
    .option('-l, --list', 'List all existing backups')
    .option('--reason <text>', 'Reason for backup', 'Manual backup')
    .action(async (options: { skill?: string; list?: boolean; reason: string }) => {
      try {
        if (options.list) {
          const list = await listBackups()
          if (list.length === 0) {
            console.log('No backups found.')
            return
          }
          console.log(`\n=== Backup List (${list.length}) ===`)
          console.log('='.repeat(80))
          for (const item of list) {
            console.log(`Backup ID:  ${item.backupId}`)
            console.log(`Created At: ${item.createdAt}`)
            console.log(`Reason:     ${item.reason}`)
            console.log(`Items:`)
            for (const b of item.items) {
              const info = b.skillName ? ` (skillName: ${b.skillName})` : ''
              console.log(`  - [${b.type.toUpperCase()}] ${b.originalPath}${info}`)
            }
            console.log('-'.repeat(80))
          }
          return
        }

        const index = await createManualBackup(process.cwd(), options.skill, options.reason)
        const scope = options.skill ? `skill "${options.skill}"` : 'all library skills'
        console.log(`[+] Backup of ${scope} created successfully.`)
        console.log(`    Backup ID:  ${index.backupId}`)
        console.log(`    Reason:     ${index.reason}`)
        console.log(`    Items backed up: ${index.items.length}`)
      } catch (error) {
        console.error('Backup action failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
