import type { Command } from 'commander'
import { startWatch, stopWatch } from '../core/watch.js'

export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .argument('<skill-name>', 'Name of the skill to watch')
    .option('--target <targets>', 'Comma-separated list of targets (e.g. claude:user,proj_id:claude)')
    .description('Start watch mode for a skill to auto-sync developer edits')
    .action(async (skillName: string, options: { target?: string }) => {
      try {
        const targetList = options.target ? options.target.split(',').map((t) => t.trim()) : undefined
        
        console.log(`[Watch] Starting Watch Mode for skill "${skillName}"...`)
        await startWatch(skillName, targetList)
        console.log(`[Watch] Watching active. Press Ctrl+C to stop.`)

        // Keep process running and handle exit signals
        process.on('SIGINT', async () => {
          console.log('\n[Watch] Shutting down watcher...')
          await stopWatch(skillName)
          process.exit(0)
        })
      } catch (error) {
        console.error('Failed to start watch mode:', (error as Error).message)
        process.exit(1)
      }
    })
}
