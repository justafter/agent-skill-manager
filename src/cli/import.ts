import type { Command } from 'commander'
import { importSkill } from '../core/import.js'

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .argument('<path>', 'Skill directory path')
    .option('-f, --force', 'Force overwrite existing skill with different checksum')
    .option('-s, --skip', 'Skip import if skill already exists')
    .description('Import a local skill directory')
    .action(async (skillPath: string, options: { force?: boolean; skip?: boolean }) => {
      try {
        const result = await importSkill(skillPath, options)
        if (result.status === 'skipped') {
          console.log(`[-] Skill "${result.skill.name}" already exists. Skipped.`)
        } else if (result.status === 'updated') {
          console.log(`[+] Skill "${result.skill.name}" updated successfully (checksum: ${result.skill.checksum}).`)
          if (result.backupId) {
            console.log(`    Backup created: ${result.backupId}`)
          }
        } else {
          console.log(`[+] Skill "${result.skill.name}" imported successfully (checksum: ${result.skill.checksum}).`)
        }
      } catch (error) {
        console.error('Import failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
