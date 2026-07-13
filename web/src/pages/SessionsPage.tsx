import { useEffect, useMemo, useState } from 'react'
import { apiPost, apiPut } from '../api/client'
import { useApi } from '../hooks/useApi'
import { DirectoryPicker } from '../components/DirectoryPicker'
import { SessionOperationDialog, type SessionPlanView } from '../components/SessionOperationDialog'

type Agent = 'claude' | 'codex' | 'gemini'
type SessionViewMode = 'list' | 'grouped'

interface SessionRecordView {
  id: string
  agent: Agent
  location: 'agent' | 'archive'
  kind: 'transcript' | 'session-bundle' | 'artifact-only'
  title?: string
  workspacePath?: string
  createdAt?: string
  updatedAt: string
  sizeBytes: number
  fileCount: number
  activity: 'idle' | 'busy' | 'unknown'
  integrity: 'unchecked' | 'valid' | 'invalid'
  warnings: string[]
}

interface SessionScanView {
  agent: Agent
  sourceRoot: string
  archiveDir: string
  agentRecords: SessionRecordView[]
  archiveRecords: SessionRecordView[]
  stats: {
    agentBytes: number
    archiveBytes: number
    migratedBytes: number
    agentCount: number
    archiveCount: number
  }
}

interface SessionApplyView {
  items: Array<{
    sessionId: string
    state: string
    error?: { code: string; message: string }
  }>
}

interface SessionConversationView {
  sessionId: string
  agent: Agent
  location: SessionRecordView['location']
  messages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
    timestamp?: string
    kind?: string
    truncated?: boolean
  }>
  truncated: boolean
  warnings: string[]
}

export function SessionsPage() {
  const [agent, setAgent] = useState<Agent>('claude')
  const { data, isLoading, error, refetch } = useApi<SessionScanView>(`sessions-${agent}`, `/api/sessions?agent=${agent}`)
  const [archiveDir, setArchiveDir] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Set<string>>(new Set())
  const [selectedArchive, setSelectedArchive] = useState<Set<string>>(new Set())
  const [activeRecordKey, setActiveRecordKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<SessionViewMode>(() => readStoredViewMode())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [planResult, setPlanResult] = useState<SessionPlanView | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setArchiveDir(data.archiveDir || '')
  }, [data])

  useEffect(() => {
    setSelectedAgent(new Set())
    setSelectedArchive(new Set())
    setActiveRecordKey(null)
    setQuery('')
    setExpandedGroups(new Set())
  }, [agent])

  useEffect(() => {
    window.localStorage.setItem('asm.sessions.viewMode', viewMode)
  }, [viewMode])

  const agentRecords = useMemo(() => filterRecords(data?.agentRecords || [], query), [data, query])
  const archiveRecords = useMemo(() => filterRecords(data?.archiveRecords || [], query), [data, query])
  const activeRecord = useMemo(
    () => [...agentRecords, ...archiveRecords].find((record) => recordKey(record) === activeRecordKey) ?? null,
    [activeRecordKey, agentRecords, archiveRecords],
  )

  useEffect(() => {
    const visibleRecords = [...agentRecords, ...archiveRecords]
    setActiveRecordKey((current) => {
      if (current && visibleRecords.some((record) => recordKey(record) === current)) return current
      return visibleRecords[0] ? recordKey(visibleRecords[0]) : null
    })
  }, [agentRecords, archiveRecords])

  const saveArchiveDir = async () => {
    try {
      setSavingConfig(true)
      await apiPut('/api/sessions/config', { archiveDir })
      setShowConfig(false)
      await refetch()
    } catch (err) {
      alert(`保存归档目录失败：${(err as Error).message}`)
    } finally {
      setSavingConfig(false)
    }
  }

  const createPlan = async (action: 'migrate' | 'restore', explicitIds?: string[]) => {
    const ids = explicitIds ?? [...(action === 'migrate' ? selectedAgent : selectedArchive)]
    if (ids.length === 0) return
    try {
      setSubmitting(true)
      setOperationError(null)
      const result = await apiPost<SessionPlanView>(`/api/sessions/${action}/plan`, {
        agent,
        sessionIds: ids,
      })
      setPlanResult(result)
    } catch (err) {
      alert(`生成${action === 'migrate' ? '迁移' : '还原'}计划失败：${(err as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const applyPlan = async () => {
    if (!planResult) return
    try {
      setSubmitting(true)
      setOperationError(null)
      const action = planResult.plan.action
      const result = await apiPost<SessionApplyView>(`/api/sessions/${action}/apply`, { planId: planResult.plan.planId })
      const failed = result.items.filter((item) => item.state !== 'completed')
      if (failed.length > 0) {
        setOperationError(
          `操作完成，但有 ${failed.length} 项未完全结束：${failed.map((item) => `${item.sessionId} (${item.state})`).join('、')}`,
        )
      } else {
        setPlanResult(null)
        setSelectedAgent(new Set())
        setSelectedArchive(new Set())
        await refetch()
      }
    } catch (err) {
      setOperationError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page sessions-page">
      <div className="toolbar sessions-toolbar">
        <div>
          <h2>会话记录迁移与管理</h2>
          <p>归档校验成功前不会删除 Agent 原记录；还原目标存在时不会覆盖。</p>
        </div>
        <button className="button" onClick={() => setShowConfig((value) => !value)}>
          {showConfig ? '收起设置' : '设置归档目录'}
        </button>
      </div>

      {showConfig && (
        <div className="session-config-card">
          <label htmlFor="session-archive-dir">统一归档目录</label>
          <DirectoryPicker
            id="session-archive-dir"
            value={archiveDir}
            onChange={setArchiveDir}
            placeholder="例如：D:\\AgentSessionArchive"
            disabled={savingConfig}
            hint="必须填写绝对路径；与 Agent 数据目录位于同一磁盘时不会释放系统盘空间。"
          />
          <div className="session-config-actions">
            <button className="button button-primary" onClick={saveArchiveDir} disabled={savingConfig}>
              {savingConfig ? '正在保存…' : '保存设置'}
            </button>
          </div>
        </div>
      )}

      <div className="session-agent-tabs">
        {(['claude', 'codex', 'gemini'] as const).map((value) => (
          <button key={value} className={agent === value ? 'active' : ''} onClick={() => setAgent(value)}>
            {agentLabel(value)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="empty-state">正在扫描会话记录…</div>
      ) : error ? (
        <div className="session-error">扫描失败：{(error as Error).message}</div>
      ) : data ? (
        <>
          <div className="session-stat-grid">
            <StatCard label="Agent 目录" value={formatBytes(data.stats.agentBytes)} note={`${data.stats.agentCount} 条记录`} />
            <StatCard label="归档目录" value={formatBytes(data.stats.archiveBytes)} note={`${data.stats.archiveCount} 条记录`} />
            <StatCard label="已迁出逻辑空间" value={formatBytes(data.stats.migratedBytes)} note="不等同于磁盘物理块" />
          </div>

          <div className="session-path-summary">
            <div><strong>源目录：</strong><code>{data.sourceRoot}</code></div>
            <div><strong>归档目录：</strong><code>{data.archiveDir || '未配置'}</code></div>
          </div>

          <div className="session-list-toolbar">
            <div className="session-search-box">
              <span aria-hidden="true">⌕</span>
              <input
                className="form-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、会话 ID 或项目路径"
                aria-label="搜索会话记录"
              />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">×</button>}
            </div>
            <span className="session-filter-result">当前显示 {agentRecords.length + archiveRecords.length} 条</span>
            <div className="session-view-toggle" role="group" aria-label="会话展示方式">
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                <span aria-hidden="true">☷</span>列表
              </button>
              <button
                type="button"
                className={viewMode === 'grouped' ? 'active' : ''}
                aria-pressed={viewMode === 'grouped'}
                onClick={() => setViewMode('grouped')}
              >
                <span aria-hidden="true">⑂</span>分类
              </button>
            </div>
            <button className="button" onClick={() => refetch()}>重新扫描</button>
          </div>

          <div className="session-workspace-grid">
            <div className="session-list-panes">
              <SessionColumn
                title="Agent 目录"
                description="当前仍由 Agent 使用的会话记录"
                records={agentRecords}
                selected={selectedAgent}
                onSelected={setSelectedAgent}
                actionLabel={`迁移已选 (${selectedAgent.size})`}
                onAction={() => createPlan('migrate')}
                actionDisabled={!data.archiveDir || selectedAgent.size === 0 || submitting}
                location="agent"
                activeKey={activeRecordKey}
                onActivate={setActiveRecordKey}
                viewMode={viewMode}
                expandedGroups={expandedGroups}
                onToggleGroup={(key) => setExpandedGroups((current) => toggleSetValue(current, key))}
                forceExpanded={Boolean(query.trim())}
              />
              <SessionColumn
                title="归档目录"
                description="已迁出、可按原路径还原的记录"
                records={archiveRecords}
                selected={selectedArchive}
                onSelected={setSelectedArchive}
                actionLabel={`还原已选 (${selectedArchive.size})`}
                onAction={() => createPlan('restore')}
                actionDisabled={selectedArchive.size === 0 || submitting}
                location="archive"
                activeKey={activeRecordKey}
                onActivate={setActiveRecordKey}
                viewMode={viewMode}
                expandedGroups={expandedGroups}
                onToggleGroup={(key) => setExpandedGroups((current) => toggleSetValue(current, key))}
                forceExpanded={Boolean(query.trim())}
              />
            </div>
            <SessionDetail
              record={activeRecord}
              archiveConfigured={Boolean(data.archiveDir)}
              submitting={submitting}
              onAction={(record) => createPlan(record.location === 'agent' ? 'migrate' : 'restore', [record.id])}
            />
          </div>
        </>
      ) : null}

      <SessionOperationDialog
        open={!!planResult}
        result={planResult}
        submitting={submitting}
        error={operationError}
        onConfirm={applyPlan}
        onCancel={() => {
          if (submitting) return
          setPlanResult(null)
          setOperationError(null)
        }}
      />
    </section>
  )
}

function SessionColumn({
  title,
  description,
  records,
  selected,
  onSelected,
  actionLabel,
  onAction,
  actionDisabled,
  location,
  activeKey,
  onActivate,
  viewMode,
  expandedGroups,
  onToggleGroup,
  forceExpanded,
}: {
  title: string
  description: string
  records: SessionRecordView[]
  selected: Set<string>
  onSelected: (next: Set<string>) => void
  actionLabel: string
  onAction: () => void
  actionDisabled: boolean
  location: SessionRecordView['location']
  activeKey: string | null
  onActivate: (key: string) => void
  viewMode: SessionViewMode
  expandedGroups: Set<string>
  onToggleGroup: (key: string) => void
  forceExpanded: boolean
}) {
  const toggle = (record: SessionRecordView) => {
    const next = new Set(selected)
    if (next.has(record.id)) next.delete(record.id)
    else next.add(record.id)
    onSelected(next)
  }

  const renderRecord = (record: SessionRecordView) => (
    <SessionRecordRow
      key={recordKey(record)}
      record={record}
      selected={selected.has(record.id)}
      active={activeKey === recordKey(record)}
      selectable={location === 'agent'
        ? record.activity === 'idle' && record.integrity !== 'invalid'
        : record.integrity !== 'invalid'}
      onToggle={() => toggle(record)}
      onActivate={() => onActivate(recordKey(record))}
    />
  )

  const groups = groupRecords(records)

  return (
    <div className="session-column">
      <div className="session-column-header">
        <div>
          <div className="session-column-title"><strong>{title}</strong><span>{records.length}</span></div>
          <small>{description}</small>
        </div>
        <button className="button button-primary" onClick={onAction} disabled={actionDisabled}>{actionLabel}</button>
      </div>
      {records.length === 0 ? (
        <div className="session-column-empty">暂无会话记录</div>
      ) : viewMode === 'grouped' ? (
        <div className="session-record-list session-classified-list">
          <div className="session-provider-group">
            <div className="session-provider-header">
              <span className="session-group-chevron" aria-hidden="true">⌄</span>
              <span className={`session-agent-mark session-agent-mark-${records[0].agent}`} aria-hidden="true">
                {agentMark(records[0].agent)}
              </span>
              <strong>{agentLabel(records[0].agent)}</strong>
              <span className="session-group-count">{records.length}</span>
            </div>
            {groups.map((group) => {
              const groupKey = `${location}:${group.path}`
              const expanded = forceExpanded || expandedGroups.has(groupKey)
              return (
                <div className="session-project-group" key={groupKey}>
                  <button
                    type="button"
                    className="session-project-header"
                    onClick={() => onToggleGroup(groupKey)}
                    aria-expanded={expanded}
                    title={group.path === '__unidentified__' ? '未识别项目目录' : group.path}
                  >
                    <span className="session-group-chevron" aria-hidden="true">{expanded ? '⌄' : '›'}</span>
                    <span aria-hidden="true">▱</span>
                    <strong>{group.label}</strong>
                    <span className="session-group-count">{group.records.length}</span>
                  </button>
                  {expanded && <div className="session-project-records">{group.records.map(renderRecord)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="session-record-list">{records.map(renderRecord)}</div>
      )}
    </div>
  )
}

function SessionRecordRow({
  record,
  selected,
  active,
  selectable,
  onToggle,
  onActivate,
}: {
  record: SessionRecordView
  selected: boolean
  active: boolean
  selectable: boolean
  onToggle: () => void
  onActivate: () => void
}) {
  return (
    <div className={`session-record ${active ? 'active' : ''} ${selectable ? '' : 'disabled'}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={!selectable}
        aria-label={`选择${record.title || record.id}`}
      />
      <button className="session-record-select" type="button" onClick={onActivate}>
        <span className={`session-agent-mark session-agent-mark-${record.agent}`} aria-hidden="true">{agentMark(record.agent)}</span>
        <div className="session-record-body">
          <div className="session-record-title">
            <strong>{record.title || record.id}</strong>
            <span className={`session-state-dot ${recordStatusTone(record)}`} title={recordStatusLabel(record)} />
          </div>
          <div className="session-record-subtitle">
            <span>{formatRelativeTime(record.updatedAt)}</span>
            <span>{formatBytes(record.sizeBytes)}</span>
            {record.workspacePath && <span title={record.workspacePath}>{baseName(record.workspacePath)}</span>}
          </div>
          <div className="session-record-kind">{kindLabel(record.kind)}</div>
        </div>
        <span className="session-record-chevron" aria-hidden="true">›</span>
      </button>
    </div>
  )
}

function SessionDetail({
  record,
  archiveConfigured,
  submitting,
  onAction,
}: {
  record: SessionRecordView | null
  archiveConfigured: boolean
  submitting: boolean
  onAction: (record: SessionRecordView) => void
}) {
  if (!record) {
    return (
      <aside className="session-detail session-detail-empty">
        <span className="session-detail-empty-icon" aria-hidden="true">◫</span>
        <strong>选择一条会话查看详情</strong>
        <p>左侧列表用于批量操作，点击会话正文可在这里核对路径、状态和大小。</p>
      </aside>
    )
  }

  const selectable = record.location === 'agent'
    ? record.activity === 'idle' && record.integrity !== 'invalid' && archiveConfigured
    : record.integrity !== 'invalid'
  const actionLabel = record.location === 'agent' ? '迁移此会话' : '还原此会话'

  return (
    <aside className="session-detail">
      <div className="session-detail-header">
        <div className="session-detail-identity">
          <span className={`session-agent-mark session-agent-mark-${record.agent}`}>{agentMark(record.agent)}</span>
          <div>
            <span>{agentLabel(record.agent)} · {record.location === 'agent' ? 'Agent 目录' : '归档目录'}</span>
            <h3>{record.title || record.id}</h3>
          </div>
        </div>
        <span className={`session-detail-status ${recordStatusTone(record)}`}>{recordStatusLabel(record)}</span>
      </div>

      <SessionConversation record={record} />

      <details className="session-detail-metadata">
        <summary>会话信息与迁移状态</summary>
        <div className="session-detail-stats">
          <DetailStat label="占用空间" value={formatBytes(record.sizeBytes)} />
          <DetailStat label="文件数量" value={`${record.fileCount}`} />
          <DetailStat label="最近更新" value={formatRelativeTime(record.updatedAt)} />
        </div>

        <div className="session-detail-section">
          <h4>会话信息</h4>
          <DetailRow label="类型" value={kindLabel(record.kind)} />
          <DetailRow label="更新时间" value={new Date(record.updatedAt).toLocaleString()} />
          {record.createdAt && <DetailRow label="创建时间" value={new Date(record.createdAt).toLocaleString()} />}
          <DetailRow label="会话 ID" value={record.id} mono />
        </div>

        <div className="session-detail-section">
          <h4>路径与项目</h4>
          <DetailRow label="项目目录" value={record.workspacePath || '未识别'} mono={Boolean(record.workspacePath)} />
          <DetailRow label="记录位置" value={record.location === 'agent' ? 'Agent 原目录' : '外部归档目录'} />
        </div>

        {record.warnings.length > 0 && (
          <div className="session-detail-warning">
            <strong>注意</strong>
            {record.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        )}

        <div className="session-detail-safety">
          {record.location === 'agent'
            ? '执行时会再次检查会话是否停止写入，并在归档校验成功后才删除源记录。'
            : '还原前会校验 manifest 与 payload；原路径存在同名记录时拒绝覆盖。'}
        </div>
      </details>

      <button
        className="button button-primary session-detail-action"
        disabled={!selectable || submitting}
        onClick={() => onAction(record)}
      >
        {submitting ? '正在生成计划…' : actionLabel}
      </button>
      {!selectable && (
        <small className="session-detail-action-hint">
          {record.location === 'agent' && !archiveConfigured
            ? '请先设置归档目录。'
            : '当前记录状态不允许执行操作。'}
        </small>
      )}
    </aside>
  )
}

function SessionConversation({ record }: { record: SessionRecordView }) {
  const path = `/api/sessions/${record.agent}/${record.location}/${encodeURIComponent(record.id)}/messages`
  const { data, isLoading, error } = useApi<SessionConversationView>(`session-conversation-${recordKey(record)}`, path)

  return (
    <section className="session-conversation" aria-label="对话记录">
      <div className="session-conversation-header">
        <div>
          <strong>对话记录</strong>
          <span>{data ? `${data.messages.length} 条消息` : '按需读取 transcript'}</span>
        </div>
        {data?.truncated && <span className="session-conversation-limit">已截断</span>}
      </div>
      <div className="session-message-list">
        {isLoading ? (
          <div className="session-conversation-state">正在读取会话内容…</div>
        ) : error ? (
          <div className="session-conversation-state danger">读取失败：{(error as Error).message}</div>
        ) : data && data.messages.length > 0 ? (
          data.messages.map((message) => <SessionMessageCard key={message.id} message={message} />)
        ) : (
          <div className="session-conversation-state">该记录暂无可展示的对话内容。</div>
        )}
      </div>
      {data && data.warnings.length > 0 && (
        <div className="session-conversation-warnings">
          {data.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}
    </section>
  )
}

function SessionMessageCard({ message }: { message: SessionConversationView['messages'][number] }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = message.content.length > 1_600
  const content = collapsible && !expanded ? `${message.content.slice(0, 1_600)}\n…` : message.content
  return (
    <article className={`session-message session-message-${message.role}`}>
      <header>
        <strong>{messageRoleLabel(message.role)}</strong>
        <span>{message.timestamp ? formatMessageTime(message.timestamp) : message.kind ? messageKindLabel(message.kind) : ''}</span>
      </header>
      <pre>{content}</pre>
      {collapsible && (
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起长消息' : '展开完整消息'}
        </button>
      )}
      {message.truncated && <small>该条消息已达到读取上限</small>}
    </article>
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="session-detail-row"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div>
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="session-stat-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function filterRecords(records: SessionRecordView[], query: string): SessionRecordView[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return records
  return records.filter((record) =>
    [record.id, record.title, record.workspacePath].some((value) => value?.toLowerCase().includes(keyword)),
  )
}

function groupRecords(records: SessionRecordView[]): Array<{ path: string; label: string; records: SessionRecordView[] }> {
  const grouped = new Map<string, SessionRecordView[]>()
  records.forEach((record) => {
    const key = record.workspacePath || '__unidentified__'
    const current = grouped.get(key) ?? []
    current.push(record)
    grouped.set(key, current)
  })
  return [...grouped.entries()]
    .map(([groupPath, groupRecords]) => ({
      path: groupPath,
      label: groupPath === '__unidentified__' ? '未识别项目' : baseName(groupPath),
      records: groupRecords,
    }))
    .sort((left, right) => {
      if (left.path === '__unidentified__') return 1
      if (right.path === '__unidentified__') return -1
      return left.label.localeCompare(right.label, 'zh-CN')
    })
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function readStoredViewMode(): SessionViewMode {
  const value = window.localStorage.getItem('asm.sessions.viewMode')
  return value === 'grouped' ? 'grouped' : 'list'
}

function agentLabel(agent: Agent): string {
  return { claude: 'Claude', codex: 'Codex', gemini: 'Gemini / Antigravity' }[agent]
}

function kindLabel(kind: SessionRecordView['kind']): string {
  return { transcript: '转录文件', 'session-bundle': '完整会话', 'artifact-only': '仅 artifacts' }[kind]
}

function activityLabel(activity: SessionRecordView['activity']): string {
  return { idle: '可迁移', busy: '正在占用', unknown: '空闲状态未知' }[activity]
}

function integrityLabel(integrity: SessionRecordView['integrity']): string {
  return { unchecked: '待操作时校验', valid: '校验通过', invalid: '归档损坏' }[integrity]
}

function recordKey(record: SessionRecordView): string {
  return `${record.location}:${record.id}`
}

function recordStatusLabel(record: SessionRecordView): string {
  return record.location === 'agent' ? activityLabel(record.activity) : integrityLabel(record.integrity)
}

function recordStatusTone(record: SessionRecordView): string {
  const status = record.location === 'agent' ? record.activity : record.integrity
  if (status === 'idle' || status === 'valid') return 'success'
  if (status === 'busy' || status === 'invalid') return 'danger'
  return 'warning'
}

function agentMark(agent: Agent): string {
  return { claude: 'C', codex: 'O', gemini: 'G' }[agent]
}

function messageRoleLabel(role: SessionConversationView['messages'][number]['role']): string {
  return { user: '用户', assistant: '助手', system: '系统', tool: '工具' }[role]
}

function messageKindLabel(kind: string): string {
  return kind.replaceAll('-', ' ')
}

function formatMessageTime(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value
}

function baseName(value: string): string {
  const normalized = value.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || value
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '时间未知'
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 60) return '刚刚'
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString()
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let index = 0
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024
    index++
  }
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}
