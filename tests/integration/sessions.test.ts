import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import { once } from 'node:events'
import { scanSessions } from '../../src/sessions/scan.js'
import { createMigratePlan, createRestorePlan } from '../../src/sessions/plan.js'
import { applySessionPlan } from '../../src/sessions/apply.js'
import { listOperationLogs } from '../../src/sessions/operation-journal.js'
import { loadSessionConversation } from '../../src/sessions/conversation.js'
import { pathExists } from '../../src/utils/fs.js'
import { createApp } from '../../src/server/app.js'

describe('D11 session migration and restore', () => {
  let root: string
  let originalUserProfile: string | undefined
  let originalHome: string | undefined
  let archiveDir: string
  let claudeRoot: string
  let codexRoot: string
  let geminiRoot: string

  before(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'asm-sessions-test-'))
    originalUserProfile = process.env.USERPROFILE
    originalHome = process.env.HOME
    process.env.USERPROFILE = root
    process.env.HOME = root

    archiveDir = path.join(root, 'external-archive')
    claudeRoot = path.join(root, '.claude')
    codexRoot = path.join(root, '.codex')
    geminiRoot = path.join(root, '.gemini', 'antigravity', 'brain')

    await writeFile(
      path.join(root, 'skill-manager.config.json'),
      JSON.stringify(
        {
          backupDir: './backups',
          devDir: '',
          ruleTemplateDir: './library/rules',
          server: { host: '127.0.0.1', port: 47821 },
          targets: {
            claude: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
            codex: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
            gemini: { enabled: false, userSkillPath: '', projectSkillPath: '', projectRuleFile: '' },
          },
          sessions: {
            archiveDir,
            agents: {
              claude: { enabled: true, root: claudeRoot },
              codex: { enabled: true, root: codexRoot },
              gemini: { enabled: true, root: geminiRoot },
            },
          },
          projects: [],
        },
        null,
        2,
      ),
    )
  })

  after(async () => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    await rm(root, { recursive: true, force: true })
  })

  it('scans Claude transcript and same-ID companion directory as one bundle', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const projectDir = path.join(claudeRoot, 'projects', 'D--Repo')
    await mkdir(path.join(projectDir, id, 'tool-results'), { recursive: true })
    await writeFile(
      path.join(projectDir, `${id}.jsonl`),
      [
        JSON.stringify({
          sessionId: id,
          uuid: 'claude-user',
          type: 'user',
          timestamp: '2026-07-01T09:00:00.000Z',
          message: { role: 'user', content: 'Claude question' },
        }),
        JSON.stringify({
          sessionId: id,
          uuid: 'claude-assistant',
          type: 'assistant',
          timestamp: '2026-07-01T09:01:00.000Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'must stay hidden' },
              { type: 'text', text: 'Claude answer' },
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'README.md' } },
            ],
          },
        }),
        JSON.stringify({
          sessionId: id,
          uuid: 'claude-tool-result',
          type: 'user',
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'README output' }] },
        }),
      ].join('\n'),
    )
    await writeFile(path.join(projectDir, id, 'tool-results', 'result.txt'), 'tool output')
    await mkdir(claudeRoot, { recursive: true })
    await writeFile(
      path.join(claudeRoot, 'history.jsonl'),
      `${JSON.stringify({ sessionId: id, display: 'Claude test title', project: 'D:\\Repo', timestamp: Date.now() - 600_000 })}\n`,
    )
    await ageTree(claudeRoot)

    const scan = await scanSessions('claude', root)
    const record = scan.agentRecords.find((item) => item.id === id)
    assert.ok(record)
    assert.equal(record.kind, 'session-bundle')
    assert.equal(record.entries.length, 2)
    assert.equal(record.title, 'Claude test title')
    assert.equal(record.activity, 'idle')
    assert.equal(record.fileCount, 2)

    const conversation = await loadSessionConversation('claude', 'agent', id, root)
    assert.deepEqual(conversation.messages.map((message) => message.role), ['user', 'assistant', 'tool', 'tool'])
    assert.equal(conversation.messages[0].content, 'Claude question')
    assert.ok(conversation.messages.some((message) => message.content.includes('Claude answer')))
    assert.ok(!conversation.messages.some((message) => message.content.includes('must stay hidden')))
  })

  it('uses Codex payload.id instead of shared parent session_id and joins index titles', async () => {
    const parentId = '22222222-2222-4222-8222-222222222222'
    const firstId = '33333333-3333-4333-8333-333333333333'
    const secondId = '44444444-4444-4444-8444-444444444444'
    const sessionsDir = path.join(codexRoot, 'sessions', '2026', '07', '01')
    await mkdir(sessionsDir, { recursive: true })
    await writeFile(
      path.join(sessionsDir, `rollout-2026-07-01T10-00-00-${firstId}.jsonl`),
      [
        JSON.stringify({
          type: 'session_meta',
          payload: { id: firstId, session_id: parentId, cwd: 'D:\\One', timestamp: '2026-07-01T10:00:00.000Z' },
        }),
        JSON.stringify({
          type: 'response_item',
          timestamp: '2026-07-01T10:01:00.000Z',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Codex question' }] },
        }),
        JSON.stringify({
          type: 'response_item',
          payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'hidden developer prompt' }] },
        }),
        JSON.stringify({
          type: 'response_item',
          payload: { type: 'reasoning', summary: ['hidden reasoning'] },
        }),
        JSON.stringify({
          type: 'response_item',
          timestamp: '2026-07-01T10:02:00.000Z',
          payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Codex answer' }] },
        }),
        JSON.stringify({
          type: 'response_item',
          payload: { type: 'function_call', call_id: 'call-1', name: 'shell_command', arguments: '{"command":"pwd"}' },
        }),
      ].join('\n'),
    )
    await writeFile(
      path.join(sessionsDir, `rollout-2026-07-01T11-00-00-${secondId}.jsonl`),
      `${JSON.stringify({ type: 'session_meta', payload: { id: secondId, session_id: parentId, cwd: 'D:\\Two', timestamp: '2026-07-01T11:00:00.000Z' } })}\n`,
    )
    await writeFile(
      path.join(codexRoot, 'session_index.jsonl'),
      [
        JSON.stringify({ id: firstId, thread_name: 'First rollout', updated_at: '2026-07-01T10:30:00.000Z' }),
        JSON.stringify({ id: secondId, thread_name: 'Second rollout', updated_at: '2026-07-01T11:30:00.000Z' }),
      ].join('\n'),
    )
    await ageTree(codexRoot)

    const scan = await scanSessions('codex', root)
    const first = scan.agentRecords.find((item) => item.id === firstId)
    const second = scan.agentRecords.find((item) => item.id === secondId)
    assert.ok(first)
    assert.ok(second)
    assert.equal(first.title, 'First rollout')
    assert.equal(second.title, 'Second rollout')
    assert.equal(scan.agentRecords.filter((item) => item.id === parentId).length, 0)

    const conversation = await loadSessionConversation('codex', 'agent', firstId, root)
    assert.deepEqual(conversation.messages.map((message) => message.role), ['user', 'assistant', 'tool'])
    assert.equal(conversation.messages[0].content, 'Codex question')
    assert.ok(!conversation.messages.some((message) => message.content.includes('hidden')))
  })

  it('classifies Gemini UUID directories and ignores non-UUID storage', async () => {
    const fullId = '55555555-5555-4555-8555-555555555555'
    const artifactId = '66666666-6666-4666-8666-666666666666'
    await mkdir(path.join(geminiRoot, fullId, '.system_generated', 'logs'), { recursive: true })
    await writeFile(
      path.join(geminiRoot, fullId, '.system_generated', 'logs', 'transcript.jsonl'),
      [
        JSON.stringify({
          type: 'USER_INPUT',
          content: 'Gemini question',
          created_at: '2026-07-01T12:00:00.000Z',
          source: 'USER_EXPLICIT',
          status: 'DONE',
        }),
        JSON.stringify({
          type: 'PLANNER_RESPONSE',
          content: 'Gemini answer',
          thinking: 'must stay hidden',
          tool_calls: [{ name: 'view_file', args: { path: 'README.md' } }],
          created_at: '2026-07-01T12:01:00.000Z',
          source: 'MODEL',
          status: 'DONE',
        }),
        JSON.stringify({ type: 'RUN_COMMAND', content: 'Command output', source: 'MODEL', status: 'DONE' }),
        JSON.stringify({ type: 'CONVERSATION_HISTORY', content: 'duplicated context', source: 'SYSTEM', status: 'DONE' }),
      ].join('\n'),
    )
    await mkdir(path.join(geminiRoot, artifactId), { recursive: true })
    await writeFile(path.join(geminiRoot, artifactId, 'artifact.txt'), 'artifact')
    await mkdir(path.join(geminiRoot, 'tempmediaStorage'), { recursive: true })
    await writeFile(path.join(geminiRoot, 'tempmediaStorage', 'ignored.bin'), 'ignored')
    await ageTree(geminiRoot)

    const scan = await scanSessions('gemini', root)
    assert.equal(scan.agentRecords.find((item) => item.id === fullId)?.kind, 'session-bundle')
    assert.equal(scan.agentRecords.find((item) => item.id === artifactId)?.kind, 'artifact-only')
    assert.ok(!scan.agentRecords.some((item) => item.id === 'tempmediaStorage'))

    const conversation = await loadSessionConversation('gemini', 'agent', fullId, root)
    assert.deepEqual(conversation.messages.map((message) => message.role), ['user', 'assistant', 'tool', 'tool'])
    assert.ok(!conversation.messages.some((message) => message.content.includes('must stay hidden')))
    assert.ok(!conversation.messages.some((message) => message.content.includes('duplicated context')))
  })

  it('serves selected conversation messages through the read-only API', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const projectDir = path.join(claudeRoot, 'projects', 'D--Api')
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      path.join(projectDir, `${id}.jsonl`),
      `${JSON.stringify({ type: 'user', uuid: 'api-message', message: { role: 'user', content: 'API question' } })}\n`,
    )
    await ageTree(projectDir)

    const originalCwd = process.cwd()
    process.chdir(root)
    const server = createApp().listen(0, '127.0.0.1')
    try {
      await once(server, 'listening')
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      const response = await fetch(`http://127.0.0.1:${address.port}/api/sessions/claude/agent/${id}/messages`)
      assert.equal(response.status, 200)
      const conversation = await response.json() as { messages: Array<{ role: string; content: string }> }
      assert.deepEqual(conversation.messages, [{ id: 'api-message', role: 'user', content: 'API question' }])

      const invalid = await fetch(`http://127.0.0.1:${address.port}/api/sessions/claude/agent/not-a-uuid/messages`)
      assert.equal(invalid.status, 400)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      process.chdir(originalCwd)
    }
  })

  it('plans, migrates and restores a Gemini session without deleting before verification', async () => {
    const id = '77777777-7777-4777-8777-777777777777'
    const sourceDir = path.join(geminiRoot, id)
    const transcript = path.join(sourceDir, '.system_generated', 'logs', 'transcript.jsonl')
    await mkdir(path.dirname(transcript), { recursive: true })
    await writeFile(
      transcript,
      [
        JSON.stringify({ type: 'USER_INPUT', content: 'Archived question', created_at: '2026-07-01T13:00:00.000Z' }),
        JSON.stringify({ type: 'PLANNER_RESPONSE', content: 'Archived answer', created_at: '2026-07-01T13:01:00.000Z' }),
      ].join('\n'),
    )
    await writeFile(path.join(sourceDir, 'artifact.txt'), 'artifact payload')
    await ageTree(sourceDir)

    const migratePlan = await createMigratePlan('gemini', [id], root)
    assert.equal(migratePlan.summary.ready, 1)
    const bundlePath = path.join(archiveDir, 'sessions', 'gemini', id)
    assert.ok(!(await pathExists(bundlePath)), 'dry-run must not create the archive bundle')

    const migrated = await applySessionPlan(migratePlan.plan.planId, root, {
      lockProbe: false,
      stabilityWindowMs: 1,
    })
    assert.equal(migrated.items[0].state, 'completed')
    assert.ok(!(await pathExists(sourceDir)))
    assert.ok(await pathExists(path.join(bundlePath, 'manifest.json')))
    assert.ok(await pathExists(path.join(bundlePath, 'payload', id, 'artifact.txt')))

    const archivedScan = await scanSessions('gemini', root)
    assert.equal(archivedScan.archiveRecords.find((item) => item.id === id)?.integrity, 'unchecked')
    assert.ok(archivedScan.stats.archiveBytes > 0)
    assert.equal(archivedScan.stats.migratedBytes, archivedScan.stats.archiveBytes)
    const archivedConversation = await loadSessionConversation('gemini', 'archive', id, root)
    assert.deepEqual(archivedConversation.messages.map((message) => message.content), ['Archived question', 'Archived answer'])

    await mkdir(sourceDir, { recursive: true })
    await writeFile(path.join(sourceDir, 'new-record.txt'), 'conflict')
    const duplicatedScan = await scanSessions('gemini', root)
    assert.equal(duplicatedScan.stats.migratedBytes, 0, 'a retained source copy must not count as released space')
    const conflictPlan = await createRestorePlan('gemini', [id], root)
    assert.equal(conflictPlan.summary.conflict, 1)
    await rm(sourceDir, { recursive: true, force: true })

    const restorePlan = await createRestorePlan('gemini', [id], root)
    assert.equal(restorePlan.summary.ready, 1)
    const restored = await applySessionPlan(restorePlan.plan.planId, root, { lockProbe: false })
    assert.equal(restored.items[0].state, 'completed')
    assert.equal(await readFile(path.join(sourceDir, 'artifact.txt'), 'utf8'), 'artifact payload')
    assert.ok(!(await pathExists(bundlePath)))
    const restoredConversation = await loadSessionConversation('gemini', 'agent', id, root)
    assert.equal(restoredConversation.messages[1].content, 'Archived answer')

    const logs = await listOperationLogs(archiveDir)
    assert.ok(logs.length >= 2)
    assert.ok(logs.some((log) => log.items.some((item) => item.sessionId === id && item.state === 'completed')))
  })

  it('rejects apply when source content changed after plan creation', async () => {
    const id = '88888888-8888-4888-8888-888888888888'
    const sourceDir = path.join(geminiRoot, id)
    await mkdir(path.join(sourceDir, '.system_generated', 'logs'), { recursive: true })
    const transcript = path.join(sourceDir, '.system_generated', 'logs', 'transcript.jsonl')
    await writeFile(transcript, '{"step":1}\n')
    await ageTree(sourceDir)

    const plan = await createMigratePlan('gemini', [id], root)
    assert.equal(plan.summary.ready, 1)
    await writeFile(transcript, '{"step":2}\n')

    const applied = await applySessionPlan(plan.plan.planId, root, {
      lockProbe: false,
      stabilityWindowMs: 1,
    })
    assert.equal(applied.items[0].state, 'failed')
    assert.equal(applied.items[0].error?.code, 'SOURCE_CHANGED')
    assert.ok(await pathExists(sourceDir))
    assert.ok(!(await pathExists(path.join(archiveDir, 'sessions', 'gemini', id))))
  })

  it('marks a recently written session as unavailable for migration', async () => {
    const id = '99999999-9999-4999-8999-999999999999'
    const sourceDir = path.join(geminiRoot, id)
    await mkdir(sourceDir, { recursive: true })
    await writeFile(path.join(sourceDir, 'recent.txt'), 'still active')

    const plan = await createMigratePlan('gemini', [id], root)
    assert.equal(plan.summary.ready, 0)
    assert.equal(plan.summary.busy, 1)
    assert.match(plan.plan.items[0].reason ?? '', /无法确认/)
  })

  it('rejects a tampered archive manifest that escapes the configured source root', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const bundlePath = path.join(archiveDir, 'sessions', 'gemini', id)
    const payloadPath = path.join(bundlePath, 'payload', id)
    await mkdir(payloadPath, { recursive: true })
    await writeFile(path.join(payloadPath, 'artifact.txt'), 'payload')
    await writeFile(
      path.join(bundlePath, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        archiveId: id,
        agent: 'gemini',
        sessionId: id,
        kind: 'artifact-only',
        originalRoot: geminiRoot,
        originalPath: path.join(geminiRoot, id),
        entries: [
          {
            originalRelativePath: '../escaped',
            payloadRelativePath: id,
            type: 'directory',
          },
        ],
        fileCount: 1,
        sizeBytes: 7,
        checksum: `sha256:${'0'.repeat(64)}`,
        updatedAt: new Date().toISOString(),
        archivedAt: new Date().toISOString(),
        adapterVersion: 'test',
      }),
    )

    const scan = await scanSessions('gemini', root)
    const archived = scan.archiveRecords.find((item) => item.id === id)
    assert.equal(archived?.integrity, 'invalid')

    const plan = await createRestorePlan('gemini', [id], root)
    assert.equal(plan.summary.invalid, 1)
    assert.match(plan.plan.items[0].reason ?? '', /Unsafe relative path/)
    assert.ok(!(await pathExists(path.join(root, 'escaped'))))
  })

  it('keeps a structurally invalid but relative restore path as an invalid plan item', async () => {
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const bundlePath = path.join(archiveDir, 'sessions', 'gemini', id)
    const payloadPath = path.join(bundlePath, 'payload', id)
    await mkdir(payloadPath, { recursive: true })
    await writeFile(path.join(payloadPath, 'artifact.txt'), 'payload')
    await writeFile(
      path.join(bundlePath, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        archiveId: id,
        agent: 'gemini',
        sessionId: id,
        kind: 'artifact-only',
        originalRoot: geminiRoot,
        originalPath: path.join(geminiRoot, id),
        entries: [
          {
            originalRelativePath: `${id}/nested`,
            payloadRelativePath: id,
            type: 'directory',
          },
        ],
        fileCount: 1,
        sizeBytes: 7,
        checksum: `sha256:${'0'.repeat(64)}`,
        updatedAt: new Date().toISOString(),
        archivedAt: new Date().toISOString(),
        adapterVersion: 'test',
      }),
    )

    const plan = await createRestorePlan('gemini', [id], root)
    assert.equal(plan.summary.invalid, 1)
    assert.match(plan.plan.items[0].reason ?? '', /Unsafe gemini session path/)
  })
})

async function ageTree(target: string): Promise<void> {
  const info = await stat(target)
  if (info.isDirectory()) {
    const entries = await readdir(target, { withFileTypes: true })
    for (const entry of entries) await ageTree(path.join(target, entry.name))
  }
  const old = new Date(Date.now() - 10 * 60 * 1000)
  await utimes(target, old, old)
}
