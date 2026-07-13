import { spawn } from 'node:child_process'
import type { SessionEntry } from './types.js'
import { snapshotSessionEntries, listSessionFiles } from './utils.js'
import { AppError } from '../utils/errors.js'

export interface ActivityProbeOptions {
  stabilityWindowMs?: number
  lockProbe?: boolean
}

export async function assertEntriesIdle(entries: SessionEntry[], options: ActivityProbeOptions = {}): Promise<void> {
  const stabilityWindowMs = options.stabilityWindowMs ?? 750
  const before = await snapshotSessionEntries(entries)
  await new Promise((resolve) => setTimeout(resolve, stabilityWindowMs))
  const after = await snapshotSessionEntries(entries)
  if (
    before.fileCount !== after.fileCount ||
    before.sizeBytes !== after.sizeBytes ||
    before.latestMtimeMs !== after.latestMtimeMs
  ) {
    throw new AppError('SESSION_BUSY', 'Session payload changed during the activity check.')
  }

  if (options.lockProbe === false) return
  const lockStatus = await probeExclusiveAccess(await listSessionFiles(entries))
  if (lockStatus === 'busy') {
    throw new AppError('SESSION_BUSY', 'Session payload is locked by another process.')
  }
  if (lockStatus === 'unsupported') {
    throw new AppError(
      'SESSION_ACTIVITY_UNKNOWN',
      'This platform cannot confirm exclusive access to the session payload.',
    )
  }
}

async function probeExclusiveAccess(files: string[]): Promise<'available' | 'busy' | 'unsupported'> {
  if (files.length === 0) return 'available'
  if (process.platform !== 'win32') return 'unsupported'

  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json',
    'foreach ($p in $paths) {',
    '  try {',
    '    $stream = [System.IO.File]::Open($p, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)',
    '    $stream.Dispose()',
    '  } catch { exit 2 }',
    '}',
  ].join('; ')

  for (const executable of ['pwsh.exe', 'powershell.exe']) {
    const result = await runLockProbe(executable, script, files)
    if (result !== 'unsupported') return result
  }
  return 'unsupported'
}

function runLockProbe(
  executable: string,
  script: string,
  files: string[],
): Promise<'available' | 'busy' | 'unsupported'> {
  return new Promise((resolve) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
    let missing = false
    child.on('error', (error: NodeJS.ErrnoException) => {
      missing = error.code === 'ENOENT'
      resolve('unsupported')
    })
    child.on('exit', (code) => {
      if (missing) return
      if (code === 0) resolve('available')
      else if (code === 2) resolve('busy')
      else resolve('unsupported')
    })
    child.stdin.end(JSON.stringify(files))
  })
}
