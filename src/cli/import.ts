import type { Command } from 'commander'
import { parseSkillDir } from '../validation/skill.js'

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .argument('<path>', 'Skill directory path')
    .description('Import a local skill directory')
    .action(async (skillPath: string) => {
      const skill = await parseSkillDir(skillPath)
      console.log(JSON.stringify(skill, null, 2))
    })
}
