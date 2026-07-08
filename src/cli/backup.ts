import type { Command } from 'commander'
import { createManualBackup, listBackups } from '../backup/create.js'
import { deleteBackup } from '../backup/delete.js'

export function registerBackupCommand(program: Command): void {
  const backupCmd = program
    .command('backup')
    .description('Manage backups')

  // `asm backup` (default): create a global backup with optional flags.
  backupCmd
    .option('-s, --skill <skill-name>', 'Backup only a specific skill')
    .option('--reason <text>', 'Reason for backup', 'Manual backup')
    .action(async (options: { skill?: string; reason: string }) => {
      try {
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

  // `asm backup --list` / `-l`: list all existing backups (preserved from D4).
  backupCmd
    .option('-l, --list', 'List all existing backups')
    .action(async (options: { list?: boolean }, command: Command) => {
      if (!options.list) return
      try {
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
      } catch (error) {
        console.error('Backup list failed:', (error as Error).message)
        process.exit(1)
      }
      // Tell commander this handler consumed its flags.
      command.opts() // touch
    })

  // `asm backup delete <backup-id> [--yes]`: delete a single backup archive.
  backupCmd
    .command('delete')
    .argument('<backup-id>', 'Backup ID to delete')
    .option('-y, --yes', 'Skip interactive confirmation (preview is still printed)')
    .description('Delete a single backup archive (irreversible)')
    .action(async (backupId: string, options: { yes?: boolean }) => {
      try {
        // Print a summary BEFORE deletion so the operator can confirm intent.
        const list = await listBackups(process.cwd())
        const target = list.find((b) => b.backupId === backupId)
        if (!target) {
          console.error(`Backup not found: ${backupId}`)
          process.exit(1)
        }
        console.log('=== Backup Deletion Preview ===')
        console.log(`Backup ID:  ${target.backupId}`)
        console.log(`Created At: ${target.createdAt}`)
        console.log(`Reason:     ${target.reason}`)
        console.log(`Items:      ${target.items.length}`)
        console.log('⚠ This operation is irreversible.')

        if (!options.yes) {
          const { default: readline } = await import('node:readline')
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
          const answer: string = await new Promise((resolve) => rl.question('Confirm delete? [y/N]: ', resolve))
          rl.close()
          if (answer.trim().toLowerCase() !== 'y') {
            console.log('Cancelled.')
            return
          }
        }

        const result = await deleteBackup(backupId, process.cwd())
        console.log(`[+] Backup ${result.backupId} deleted.`)
        console.log(`    Removed items: ${result.removedItems}`)
        console.log(`    Released bytes: ${result.removedBytes}`)
      } catch (error) {
        console.error('Backup delete failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
