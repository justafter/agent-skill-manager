import type { Command } from 'commander'
import type { SessionAgentId, SessionPlanResult, SessionScanResult } from '../sessions/types.js'
import { scanAllSessions, scanSessions } from '../sessions/scan.js'
import { createMigratePlan, createRestorePlan } from '../sessions/plan.js'
import { applySessionPlan } from '../sessions/apply.js'
import { updateSessionArchiveDir } from '../sessions/config.js'

export function registerSessionsCommand(program: Command): void {
  const sessions = program.command('sessions').description('Manage Agent session archives')

  sessions
    .command('scan')
    .option('--agent <agent>', 'claude, codex or gemini')
    .description('Scan Agent and archive session records')
    .action(async (options: { agent?: string }) => {
      try {
        const results = options.agent
          ? [await scanSessions(parseAgent(options.agent))]
          : await scanAllSessions(process.cwd())
        for (const result of results) printScan(result)
      } catch (error) {
        console.error('Session scan failed:', (error as Error).message)
        process.exitCode = 1
      }
    })

  sessions
    .command('config')
    .requiredOption('--archive-dir <path>', 'Absolute session archive directory')
    .description('Set the user-level session archive directory')
    .action(async (options: { archiveDir: string }) => {
      try {
        const config = await updateSessionArchiveDir(options.archiveDir)
        console.log(`[+] Session archive directory saved: ${config.sessions.archiveDir || '(not configured)'}`)
      } catch (error) {
        console.error('Session configuration failed:', (error as Error).message)
        process.exitCode = 1
      }
    })

  sessions
    .command('migrate')
    .requiredOption('--agent <agent>', 'claude, codex or gemini')
    .requiredOption('--ids <ids>', 'Comma-separated session IDs')
    .option('--apply', 'Apply the displayed plan', false)
    .description('Plan or apply session migration to the archive directory')
    .action(async (options: { agent: string; ids: string; apply: boolean }) => {
      await runOperation('migrate', options)
    })

  sessions
    .command('restore')
    .requiredOption('--agent <agent>', 'claude, codex or gemini')
    .requiredOption('--ids <ids>', 'Comma-separated session IDs')
    .option('--apply', 'Apply the displayed plan', false)
    .description('Plan or apply archived session restoration')
    .action(async (options: { agent: string; ids: string; apply: boolean }) => {
      await runOperation('restore', options)
    })
}

async function runOperation(
  action: 'migrate' | 'restore',
  options: { agent: string; ids: string; apply: boolean },
): Promise<void> {
  try {
    const agent = parseAgent(options.agent)
    const ids = options.ids.split(',').map((value) => value.trim()).filter(Boolean)
    const result =
      action === 'migrate' ? await createMigratePlan(agent, ids) : await createRestorePlan(agent, ids)
    printPlan(result)
    if (!options.apply) {
      console.log('Dry-run only. Re-run with --apply to execute this operation from a freshly generated plan.')
      return
    }
    if (result.summary.ready === 0) {
      console.log('No applicable session items.')
      return
    }
    const applied = await applySessionPlan(result.plan.planId)
    console.log(`\n[+] Operation ${applied.operationId} finished.`)
    for (const item of applied.items) {
      console.log(`  [${item.state.toUpperCase()}] ${item.sessionId}${item.error ? ` - ${item.error.message}` : ''}`)
    }
  } catch (error) {
    console.error(`Session ${action} failed:`, (error as Error).message)
    process.exitCode = 1
  }
}

function printScan(result: SessionScanResult): void {
  console.log(`\n=== ${result.agent.toUpperCase()} Sessions ===`)
  console.log(`Source:  ${result.sourceRoot}`)
  console.log(`Archive: ${result.archiveDir || '(not configured)'}`)
  console.log(`Agent records:   ${result.stats.agentCount} (${formatBytes(result.stats.agentBytes)})`)
  console.log(`Archive records: ${result.stats.archiveCount} (${formatBytes(result.stats.archiveBytes)})`)
  for (const record of result.agentRecords) {
    console.log(`  [AGENT/${record.activity}] ${record.id} ${formatBytes(record.sizeBytes)} ${record.title ?? ''}`)
  }
  for (const record of result.archiveRecords) {
    console.log(`  [ARCHIVE/${record.integrity}] ${record.id} ${formatBytes(record.sizeBytes)} ${record.title ?? ''}`)
  }
}

function printPlan(result: SessionPlanResult): void {
  console.log(`\n=== Session ${result.plan.action} plan [${result.plan.planId}] ===`)
  console.log(`Agent: ${result.plan.agent}`)
  console.log(
    `Ready: ${result.summary.ready}, Conflict: ${result.summary.conflict}, Busy: ${result.summary.busy}, Invalid: ${result.summary.invalid}`,
  )
  for (const item of result.plan.items) {
    console.log(`  [${item.status.toUpperCase()}] ${item.sessionId} -> ${item.targetPath}`)
    if (item.reason) console.log(`      ${item.reason}`)
    for (const warning of item.warnings) console.log(`      Warning: ${warning}`)
  }
}

function parseAgent(value: string): SessionAgentId {
  if (!['claude', 'codex', 'gemini'].includes(value)) {
    throw new Error(`Invalid session agent: ${value}`)
  }
  return value as SessionAgentId
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let amount = value / 1024
  let index = 0
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024
    index++
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[index]}`
}
