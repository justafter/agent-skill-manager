import { createReadStream } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type {
  SessionAgentId,
  SessionConversation,
  SessionLocation,
  SessionMessage,
  SessionMessageRole,
  SessionRecord,
} from './types.js'
import { scanSessions } from './scan.js'
import { assertArchivePathSafe, assertSessionEntriesSafe } from './path-guard.js'
import { pathExists } from '../utils/fs.js'
import { isPathInside } from '../utils/paths.js'
import { resolveRealpath } from '../projects/guard.js'
import { AppError } from '../utils/errors.js'

const MAX_MESSAGES = 1_000
const MAX_LINES = 100_000
const MAX_MESSAGE_CHARS = 40_000
const MAX_TOTAL_CHARS = 2_000_000

type JsonRecord = Record<string, unknown>
type MessageCandidate = Omit<SessionMessage, 'id'> & { id?: string }

export async function loadSessionConversation(
  agent: SessionAgentId,
  location: SessionLocation,
  sessionId: string,
  root = process.cwd(),
): Promise<SessionConversation> {
  const scan = await scanSessions(agent, root)
  const records = location === 'agent' ? scan.agentRecords : scan.archiveRecords
  const record = records.find((item) => item.id === sessionId)
  if (!record) throw new AppError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
  if (record.integrity === 'invalid') {
    throw new AppError('INVALID_MANIFEST', `Session record is invalid: ${sessionId}`)
  }

  if (location === 'agent') {
    await assertSessionEntriesSafe(agent, record.sourceRoot, record.entries)
  } else {
    for (const entry of record.entries) await assertArchivePathSafe(scan.archiveDir, entry.absolutePath)
  }

  const transcriptPath = await findTranscriptPath(record)
  if (!transcriptPath) {
    return {
      sessionId,
      agent,
      location,
      messages: [],
      truncated: false,
      warnings: ['该记录没有可读取的 transcript。'],
    }
  }

  return readConversationFile(record, transcriptPath)
}

async function findTranscriptPath(record: SessionRecord): Promise<string | undefined> {
  if (record.agent !== 'gemini') {
    return record.entries.find((entry) => entry.type === 'file' && entry.absolutePath.endsWith('.jsonl'))?.absolutePath
  }

  const sessionDirectory = record.entries.find((entry) => entry.type === 'directory')?.absolutePath
  if (!sessionDirectory) return undefined
  const logsDirectory = path.join(sessionDirectory, '.system_generated', 'logs')
  const candidates = [path.join(logsDirectory, 'transcript.jsonl'), path.join(logsDirectory, 'transcript_full.jsonl')]
  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue
    const [resolvedSession, resolvedCandidate] = await Promise.all([
      resolveRealpath(sessionDirectory),
      resolveRealpath(candidate),
    ])
    if (!isPathInside(resolvedSession, resolvedCandidate)) {
      throw new AppError('PATH_OUT_OF_BOUNDS', `Gemini transcript escapes its session directory: ${candidate}`)
    }
    return candidate
  }
  return undefined
}

async function readConversationFile(record: SessionRecord, transcriptPath: string): Promise<SessionConversation> {
  const input = createReadStream(transcriptPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  const messages: SessionMessage[] = []
  const warnings: string[] = []
  let malformedLines = 0
  let lineNumber = 0
  let totalChars = 0
  let truncated = false

  try {
    for await (const line of lines) {
      lineNumber += 1
      if (lineNumber > MAX_LINES) {
        truncated = true
        break
      }

      let item: JsonRecord
      try {
        const parsed = JSON.parse(line) as unknown
        if (!isRecord(parsed)) continue
        item = parsed
      } catch {
        malformedLines += 1
        continue
      }

      const candidates = parseLine(record.agent, item, lineNumber)
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]
        const normalized = normalizeCandidate(candidate)
        if (!normalized) continue
        if (messages.length >= MAX_MESSAGES || totalChars >= MAX_TOTAL_CHARS) {
          truncated = true
          break
        }

        let content = normalized.content
        let messageTruncated = normalized.truncated ?? false
        if (content.length > MAX_MESSAGE_CHARS) {
          content = `${content.slice(0, MAX_MESSAGE_CHARS)}\n…（单条消息内容过长，已截断）`
          messageTruncated = true
          truncated = true
        }
        const remainingChars = MAX_TOTAL_CHARS - totalChars
        if (content.length > remainingChars) {
          content = `${content.slice(0, Math.max(0, remainingChars))}\n…（会话内容达到读取上限）`
          messageTruncated = true
          truncated = true
        }
        if (!content.trim()) continue

        messages.push({
          ...normalized,
          id: normalized.id || `${lineNumber}-${index}`,
          content,
          truncated: messageTruncated || undefined,
        })
        totalChars += content.length
      }
      if (truncated && (messages.length >= MAX_MESSAGES || totalChars >= MAX_TOTAL_CHARS)) break
    }
  } finally {
    lines.close()
    input.destroy()
  }

  if (malformedLines > 0) warnings.push(`有 ${malformedLines} 行日志格式不完整，已跳过。`)
  if (truncated) warnings.push('会话记录较大，当前仅展示读取上限内的内容。')
  if (messages.length === 0) warnings.push('transcript 中没有识别到可展示的对话消息。')

  return {
    sessionId: record.id,
    agent: record.agent,
    location: record.location,
    messages,
    truncated,
    warnings,
  }
}

function parseLine(agent: SessionAgentId, item: JsonRecord, lineNumber: number): MessageCandidate[] {
  if (agent === 'claude') return parseClaudeLine(item, lineNumber)
  if (agent === 'codex') return parseCodexLine(item, lineNumber)
  return parseGeminiLine(item, lineNumber)
}

function parseClaudeLine(item: JsonRecord, lineNumber: number): MessageCandidate[] {
  const type = stringValue(item.type)
  const timestamp = stringValue(item.timestamp)
  const message = isRecord(item.message) ? item.message : undefined
  const baseId = stringValue(item.uuid) ?? stringValue(message?.id) ?? `${lineNumber}`

  if (type === 'user' || type === 'assistant') {
    const role: SessionMessageRole = type
    return claudeContentMessages(message?.content ?? item.content, role, baseId, timestamp)
  }
  if (type === 'system') {
    const content = textContent(item.content ?? message?.content)
    return content ? [{ id: baseId, role: 'system', content, timestamp, kind: stringValue(item.subtype) }] : []
  }
  return []
}

function claudeContentMessages(
  value: unknown,
  defaultRole: SessionMessageRole,
  baseId: string,
  timestamp?: string,
): MessageCandidate[] {
  if (!Array.isArray(value)) {
    const content = textContent(value)
    return content ? [{ id: baseId, role: defaultRole, content, timestamp }] : []
  }

  const messages: MessageCandidate[] = []
  value.forEach((block, index) => {
    if (!isRecord(block)) {
      const content = textContent(block)
      if (content) messages.push({ id: `${baseId}-${index}`, role: defaultRole, content, timestamp })
      return
    }
    const blockType = stringValue(block.type)
    if (blockType === 'thinking') return
    if (blockType === 'tool_use') {
      const name = stringValue(block.name) ?? 'tool'
      const details = printableValue(block.input)
      messages.push({
        id: stringValue(block.id) ?? `${baseId}-${index}`,
        role: 'tool',
        content: details ? `${name}\n${details}` : name,
        timestamp,
        kind: 'tool-call',
      })
      return
    }
    if (blockType === 'tool_result') {
      const content = textContent(block.content) || '工具已返回结果。'
      messages.push({
        id: `${baseId}-${index}`,
        role: 'tool',
        content,
        timestamp,
        kind: 'tool-result',
      })
      return
    }
    if (blockType === 'image') {
      messages.push({ id: `${baseId}-${index}`, role: defaultRole, content: '[图片]', timestamp, kind: 'image' })
      return
    }
    const content = textContent(block.text ?? block.content)
    if (content) messages.push({ id: `${baseId}-${index}`, role: defaultRole, content, timestamp, kind: blockType })
  })
  return messages
}

function parseCodexLine(item: JsonRecord, lineNumber: number): MessageCandidate[] {
  if (item.type !== 'response_item' || !isRecord(item.payload)) return []
  const payload = item.payload
  const payloadType = stringValue(payload.type)
  const timestamp = stringValue(item.timestamp)
  const id = stringValue(payload.id) ?? stringValue(payload.call_id) ?? `${lineNumber}`

  if (payloadType === 'message') {
    const rawRole = stringValue(payload.role)
    if (rawRole !== 'user' && rawRole !== 'assistant' && rawRole !== 'system') return []
    const content = textContent(payload.content)
    return content ? [{ id, role: rawRole, content, timestamp }] : []
  }
  if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
    const name = stringValue(payload.name) ?? payloadType
    const details = printableValue(payload.arguments ?? payload.input)
    return [{ id, role: 'tool', content: details ? `${name}\n${details}` : name, timestamp, kind: 'tool-call' }]
  }
  if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
    const content = textContent(payload.output) || '工具已返回结果。'
    return [{ id, role: 'tool', content, timestamp, kind: 'tool-result' }]
  }
  return []
}

function parseGeminiLine(item: JsonRecord, lineNumber: number): MessageCandidate[] {
  const type = stringValue(item.type)
  if (!type || type === 'CONVERSATION_HISTORY') return []
  const timestamp = stringValue(item.created_at)
  const content = textContent(item.content ?? item.error)
  const role: SessionMessageRole = type === 'USER_INPUT'
    ? 'user'
    : type === 'PLANNER_RESPONSE' || type === 'GENERIC'
      ? 'assistant'
      : type === 'SYSTEM_MESSAGE' || type === 'ERROR_MESSAGE'
        ? 'system'
        : 'tool'
  const messages: MessageCandidate[] = content
    ? [{ id: `${lineNumber}`, role, content, timestamp, kind: type.toLowerCase() }]
    : []

  if (type === 'PLANNER_RESPONSE' && Array.isArray(item.tool_calls)) {
    item.tool_calls.forEach((toolCall, index) => {
      if (!isRecord(toolCall)) return
      const name = stringValue(toolCall.name) ?? 'tool'
      const details = printableValue(toolCall.args)
      messages.push({
        id: `${lineNumber}-tool-${index}`,
        role: 'tool',
        content: details ? `${name}\n${details}` : name,
        timestamp,
        kind: 'tool-call',
      })
    })
  }
  return messages
}

function normalizeCandidate(candidate: MessageCandidate): MessageCandidate | undefined {
  const content = candidate.content.replace(/\r\n/g, '\n').trim()
  if (!content) return undefined
  return { ...candidate, content }
}

function textContent(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!Array.isArray(value)) {
    if (!isRecord(value)) return ''
    const type = stringValue(value.type)
    if (type === 'thinking' || type === 'reasoning') return ''
    if (type === 'image' || type === 'input_image') return '[图片]'
    return textContent(value.text ?? value.content)
  }
  return value
    .map((item) => textContent(item))
    .filter(Boolean)
    .join('\n\n')
}

function printableValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
