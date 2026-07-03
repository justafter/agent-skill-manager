import type { Command } from 'commander'
import { loadConfig } from '../core/config.js'

export function registerDoctorCommand(program: Command): void {
  program.command('doctor').description('Check local configuration').action(async () => {
    const config = await loadConfig()
    console.log(
      JSON.stringify(
        {
          node: process.version,
          server: config.server,
          targets: Object.keys(config.targets)
        },
        null,
        2
      )
    )
  })
}
