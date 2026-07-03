import type { Command } from 'commander'

export function registerScanCommand(program: Command): void {
  program.command('scan').description('Scan local library and targets').action(() => {
    console.log('Scan is not implemented yet.')
  })
}
