import type { Command } from 'commander'
import { diffText } from '../rules/diff.js'

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .argument('<before>', 'Before text')
    .argument('<after>', 'After text')
    .description('Create a text diff')
    .action((before: string, after: string) => {
      console.log(diffText('before', 'after', before, after))
    })
}
