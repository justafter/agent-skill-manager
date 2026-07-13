#!/usr/bin/env node
import { Command } from 'commander'
import { registerBackupCommand } from './backup.js'
import { registerDiffCommand } from './diff.js'
import { registerDoctorCommand } from './doctor.js'
import { registerImportCommand } from './import.js'
import { registerListCommand } from './list.js'
import { registerProjectCommand } from './project.js'
import { registerRestoreCommand } from './restore.js'
import { registerScanCommand } from './scan.js'
import { registerSyncCommand } from './sync.js'
import { registerWatchCommand } from './watch.js'
import { registerSessionsCommand } from './sessions.js'

const program = new Command()

program.name('asm').description('Agent Skill Manager').version('0.1.0')

registerListCommand(program)
registerScanCommand(program)
registerImportCommand(program)
registerSyncCommand(program)
registerWatchCommand(program)
registerDiffCommand(program)
registerBackupCommand(program)
registerRestoreCommand(program)
registerProjectCommand(program)
registerDoctorCommand(program)
registerSessionsCommand(program)

await program.parseAsync(process.argv)
