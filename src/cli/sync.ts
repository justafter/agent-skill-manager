import type { Command } from 'commander'
import { planSync, applySyncPlan } from '../sync/engine.js'
import type { TargetKey } from '../types/adapter.js'

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .argument('<skill-name>', 'Skill name')
    .option('--to <targets>', 'Comma-separated target keys, e.g. claude:user,codex:user (required)')
    .option('--dry-run', 'Generate and show plan without executing', true)
    .option('--allow-managed-modify', 'Allow overwriting managed targets that have changed')
    .description('Sync a local skill to target agents')
    .action(async (skillName: string, options: { to: string; dryRun: boolean; allowManagedModify?: boolean }) => {
      try {
        if (!options.to) {
          console.error('Error: --to option is required (e.g. --to claude:user,codex:user).')
          process.exit(1)
        }

        const targetKeys = options.to.split(',').map((t) => t.trim()) as TargetKey[]
        const dryRun = options.dryRun !== false

        const planResult = await planSync(skillName, targetKeys, {
          allowManagedModify: options.allowManagedModify
        })

        console.log(`\n=== Sync Plan [${planResult.plan.planId}] ===`)
        console.log(`Source: ${planResult.plan.source}`)
        console.log(`Summary:`)
        console.log(`  - Create:   ${planResult.summary.create}`)
        console.log(`  - Modify:   ${planResult.summary.modify}`)
        console.log(`  - Skip:     ${planResult.summary.skip}`)
        console.log(`  - Conflict: ${planResult.summary.conflict}`)
        console.log(``)

        for (const item of planResult.plan.items) {
          const key = item.targetKey || 'unknown'
          console.log(`  [${item.kind.toUpperCase()}] -> ${key} (${item.target})`)
        }
        console.log(``)

        if (dryRun) {
          console.log(`Dry-run mode. Plan was NOT applied.`)
          return
        }

        if (planResult.summary.create === 0 && planResult.summary.modify === 0) {
          console.log(`No changes to apply.`)
          return
        }

        const applyResult = await applySyncPlan(planResult.plan.planId, {
          allowManagedModify: options.allowManagedModify
        })

        console.log(`[+] Sync applied successfully.`)
        console.log(`    Applied: ${applyResult.applied.length} items`)
        if (applyResult.skipped.length > 0) {
          console.log(`    Skipped/Conflicts: ${applyResult.skipped.length} items`)
        }
      } catch (error) {
        console.error('Sync failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
