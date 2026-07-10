import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { apiGet, apiPost, apiPut } from '../api/client'
import { DiffView } from '../components/DiffView'
import { DirectoryPicker } from '../components/DirectoryPicker'

interface InstalledPath {
  projectId: string
  projectName: string
  path: string
  exists: boolean
}

interface RuleEntry {
  agent: 'claude' | 'codex' | 'gemini'
  name: string
  localPath: string
  installedPaths: InstalledPath[]
}

const agentStyle = (agent: string) => {
  if (agent === 'claude') return { background: '#fdf0ec', color: '#c05621' }
  if (agent === 'codex') return { background: '#ebfbee', color: '#2f855a' }
  if (agent === 'gemini') return { background: '#ebf8ff', color: '#2b6cb0' }
  return { background: '#faf5ff', color: '#6b46c1' }
}

const statusBadge = (status?: string) => {
  switch (status) {
    case 'create':
      return { label: '本地未创建', className: 'badge-missing' }
    case 'identical':
      return { label: '已同步 (一致)', className: 'badge-identical' }
    case 'changed':
      return { label: '未同步 (有差异)', className: 'badge-changed' }
    default:
      return { label: status || '未知', className: 'badge-missing' }
  }
}

const AGENTS: Array<'claude' | 'codex' | 'gemini'> = ['claude', 'codex', 'gemini']

export function RulesPage() {
  const { data: rulesData, refetch, isLoading } = useApi<any>('rules', '/api/rules')
  const { data: tplDir, refetch: refetchTplDir } = useApi<any>('rule-template-dir', '/api/config/rule-template-dir')
  const { data: projectsData, refetch: refetchProjects } = useApi<any>('projects', '/api/projects')

  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [activeProject, setActiveProject] = useState<Record<string, string>>({})
  const [diffByKey, setDiffByKey] = useState<Record<string, any>>({})
  const [loadingDiff, setLoadingDiff] = useState<Record<string, boolean>>({})
  const [showDiffByKey, setShowDiffByKey] = useState<Record<string, boolean>>({})
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({})
  const [syncMessage, setSyncMessage] = useState<Record<string, string | null>>({})
  const [crossExpanded, setCrossExpanded] = useState<Record<string, boolean>>({})
  const [crossMessage, setCrossMessage] = useState<Record<string, string | null>>({})
  const [crossInProgress, setCrossInProgress] = useState<Record<string, boolean>>({})

  // Rule-template-dir modal state
  const [tplDialogOpen, setTplDialogOpen] = useState(false)
  const [tplNewPath, setTplNewPath] = useState('')
  const [tplSaving, setTplSaving] = useState(false)
  const [tplMessage, setTplMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Create template modal state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createAgent, setCreateAgent] = useState<'claude' | 'codex' | 'gemini'>('claude')
  const [createName, setCreateName] = useState('')
  const [createSaving, setCreateSaving] = useState(false)
  const [createMessage, setCreateMessage] = useState<string | null>(null)

  const handleCreateTemplate = async () => {
    if (!createName.trim()) return
    const name = createName.trim().endsWith('.md') ? createName.trim() : `${createName.trim()}.md`
    try {
      setCreateSaving(true)
      setCreateMessage(null)
      await apiPost('/api/rules', {
        agent: createAgent,
        name,
      })
      await refetch()
      setCreateDialogOpen(false)
      setCreateName('')
    } catch (err) {
      setCreateMessage(`创建模板失败: ${(err as Error).message}`)
    } finally {
      setCreateSaving(false)
    }
  }

  // Import template modal state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importSourcePath, setImportSourcePath] = useState('')
  const [importAgent, setImportAgent] = useState<'claude' | 'codex' | 'gemini'>('claude')
  const [importName, setImportName] = useState('')
  const [importSaving, setImportSaving] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const handleSourcePathChange = (pathStr: string) => {
    setImportSourcePath(pathStr)
    setImportMessage(null)
    if (!pathStr) return

    // 尝试从路径中提取文件名
    const parts = pathStr.split(/[/\\]/)
    const fileName = parts[parts.length - 1]
    if (fileName && fileName.endsWith('.md')) {
      setImportName(fileName)

      // 智能推荐 Agent 类型
      const lower = fileName.toLowerCase()
      if (lower.includes('claude')) {
        setImportAgent('claude')
      } else if (lower.includes('agent') || lower.includes('codex')) {
        setImportAgent('codex')
      } else if (lower.includes('gemini') || lower.includes('antigravity')) {
        setImportAgent('gemini')
      }
    }
  }

  const handleImportTemplate = async () => {
    if (!importSourcePath.trim() || !importName.trim()) return
    const name = importName.trim().endsWith('.md') ? importName.trim() : `${importName.trim()}.md`
    try {
      setImportSaving(true)
      setImportMessage(null)
      await apiPost('/api/rules/import', {
        sourcePath: importSourcePath.trim(),
        agent: importAgent,
        name,
      })
      await refetch()
      setImportDialogOpen(false)
      setImportSourcePath('')
      setImportName('')
    } catch (err) {
      setImportMessage(`导入模板失败: ${(err as Error).message}`)
    } finally {
      setImportSaving(false)
    }
  }

  useEffect(() => {
    if (tplDialogOpen && tplNewPath === '' && tplDir?.absolute) {
      setTplNewPath(tplDir.absolute)
    }
  }, [tplDialogOpen, tplDir, tplNewPath])

  const handleOpenTplDialog = () => {
    setTplNewPath(tplDir?.absolute || '')
    setTplMessage(null)
    setTplDialogOpen(true)
  }

  const handleSaveTplDir = async () => {
    if (!tplNewPath.trim()) return
    try {
      setTplSaving(true)
      setTplMessage(null)
      const res = await fetch('/api/config/rule-template-dir', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tplNewPath.trim() }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error?.message || `HTTP ${res.status}`)
      }
      setTplMessage({ type: 'success', message: '已切换 Rule 模板目录，正在刷新…' })
      await refetchTplDir()
      await refetch()
      setTimeout(() => setTplDialogOpen(false), 600)
    } catch (err) {
      setTplMessage({ type: 'error', message: `切换失败: ${(err as Error).message}` })
    } finally {
      setTplSaving(false)
    }
  }

  const [isScanningRules, setIsScanningRules] = useState(false)
  const [ruleNotifications, setRuleNotifications] = useState<
    Array<{ projectId: string; agent: string; lastDetectedAt: string }>
  >([])
  const [scanFinishedMessage, setScanFinishedMessage] = useState<string | null>(null)

  const handleScanRules = async () => {
    setIsScanningRules(true)
    setScanFinishedMessage(null)
    try {
      const res = await apiPost<any>('/api/rules/watch/scan', {})
      setRuleNotifications(res.changes || [])
      if (!res.changes || res.changes.length === 0) {
        setScanFinishedMessage('扫描完成：未检测到任何项目规则与模板存在差异。')
        setTimeout(() => setScanFinishedMessage(null), 5000)
      } else {
        setScanFinishedMessage(`扫描完成：检测到有 ${res.changes.length} 处项目规则变更！`)
        setTimeout(() => setScanFinishedMessage(null), 5000)
      }
    } catch (err) {
      alert(`扫描项目规则变化失败: ${(err as Error).message}`)
    } finally {
      setIsScanningRules(false)
    }
  }

  const expandAndShowDiff = async (agent: string, projectId: string) => {
    const matchedRule = rules.find((r) => r.agent === agent && r.installedPaths.some((p) => p.projectId === projectId))
    const tKey = matchedRule ? `${agent}:${matchedRule.name}` : agent
    setExpandedAgents((prev) => ({ ...prev, [tKey]: true }))
    await loadDiff(agent, projectId)
    const elementId = `rule-row-${agent}-${projectId}`
    setTimeout(() => {
      const el = document.getElementById(elementId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.backgroundColor = '#fff8c5'
        setTimeout(() => {
          el.style.backgroundColor = ''
        }, 2000)
      }
    }, 100)
  }

  const clearNotification = async (projectId: string, agent: string) => {
    setRuleNotifications((prev) => prev.filter((n) => !(n.projectId === projectId && n.agent === agent)))
    try {
      await apiPost('/api/rules/watch/clear', {})
    } catch {}
  }

  if (isLoading || !rulesData) {
    return (
      <div className="page">
        <div className="empty-state">正在加载 Rule 模板...</div>
      </div>
    )
  }

  const rules: RuleEntry[] = rulesData.rules || []

  const keyFor = (agent: string, projectId: string) => `${agent}:${projectId}`

  const loadDiff = async (agent: string, projectId: string) => {
    const k = keyFor(agent, projectId)
    setLoadingDiff((s) => ({ ...s, [k]: true }))
    try {
      const plan = await apiGet<any>(`/api/rules/diff?projectId=${projectId}&agent=${agent}`)
      setDiffByKey((s) => ({ ...s, [k]: plan }))
      setShowDiffByKey((s) => ({ ...s, [k]: true }))
    } catch (err) {
      setSyncMessage((s) => ({ ...s, [k]: `加载 diff 失败: ${(err as Error).message}` }))
    } finally {
      setLoadingDiff((s) => ({ ...s, [k]: false }))
    }
  }

  const handlePush = async (agent: string, projectId: string) => {
    const k = keyFor(agent, projectId)
    const mode = 'overwrite'
    try {
      setIsSyncing((s) => ({ ...s, [k]: true }))
      setSyncMessage((s) => ({ ...s, [k]: null }))
      await apiPost(`/api/projects/${projectId}/rules/sync`, { agent, mode })
      setSyncMessage((s) => ({ ...s, [k]: `[成功] 已推送到项目` }))
      await loadDiff(agent, projectId)
      await refetch()
    } catch (err) {
      setSyncMessage((s) => ({ ...s, [k]: `推送失败: ${(err as Error).message}` }))
    } finally {
      setIsSyncing((s) => ({ ...s, [k]: false }))
    }
  }

  const handlePull = async (agent: string, projectId: string) => {
    const k = keyFor(agent, projectId)
    if (!window.confirm(`是否确认从项目拉取 ${agent} 规则？这将覆写本地权威模板。`)) return
    try {
      setIsSyncing((s) => ({ ...s, [k]: true }))
      setSyncMessage((s) => ({ ...s, [k]: null }))
      await apiPost(`/api/projects/${projectId}/rules/sync`, { agent, mode: 'pull' })
      setSyncMessage((s) => ({ ...s, [k]: `[成功] 已从项目拉取，并更新本地模板` }))
      await loadDiff(agent, projectId)
      await refetch()
    } catch (err) {
      setSyncMessage((s) => ({ ...s, [k]: `拉取失败: ${(err as Error).message}` }))
    } finally {
      setIsSyncing((s) => ({ ...s, [k]: false }))
    }
  }

  const handleCrossSync = async (
    projectId: string,
    sourceAgent: string,
    targetAgent: string,
  ) => {
    const k = `cross:${projectId}:${sourceAgent}->${targetAgent}`
    if (
      !window.confirm(
        `是否确认互推同步？\n\n源: 项目内的 ${sourceAgent.toUpperCase()} 规则文件\n目标: 同项目的 ${targetAgent.toUpperCase()} 规则文件\n\n这会完全覆写目标文件（目标文件写入前会自动备份）。`,
      )
    )
      return
    try {
      setCrossInProgress((s) => ({ ...s, [k]: true }))
      setCrossMessage((s) => ({ ...s, [k]: null }))
      await apiPost(`/api/projects/${projectId}/rules/cross-sync`, {
        sourceAgent,
        targetAgent,
        mode: 'overwrite',
      })
      setCrossMessage((s) => ({
        ...s,
        [k]: `[成功] ${sourceAgent.toUpperCase()} → ${targetAgent.toUpperCase()}`,
      }))
      await refetch()
    } catch (err) {
      setCrossMessage((s) => ({ ...s, [k]: `互推失败: ${(err as Error).message}` }))
    } finally {
      setCrossInProgress((s) => ({ ...s, [k]: false }))
    }
  }

  return (
    <section className="page">
      {ruleNotifications.length > 0 && (
        <div
          style={{
            background: '#fff8c5',
            border: '1px solid #ffd33d',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontWeight: 600, color: '#9a6700', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚠️ 规则变更提示 (仅检测)：</span>
            <span style={{ fontSize: '12px', fontWeight: 'normal' }}>
              检测到以下项目内 Agent 规则文件发生了变化。请选择操作（变更不自动覆写，必须手动确认）：
            </span>
          </div>
          {ruleNotifications.map((n) => {
            const projName =
              rules[0]?.installedPaths.find((p) => p.projectId === n.projectId)?.projectName || n.projectId
            return (
              <div
                key={`${n.projectId}-${n.agent}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#ffffff',
                  border: '1px solid #e1e4e8',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  fontSize: '13px',
                }}
              >
                <div>
                  <strong>{projName}</strong> 中的 <strong>{n.agent.toUpperCase()}</strong> 规则文件在{' '}
                  <span style={{ fontFamily: 'monospace' }}>{new Date(n.lastDetectedAt).toLocaleTimeString()}</span>{' '}
                  发生变更
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="button"
                    style={{ padding: '2px 8px', fontSize: '12px', borderColor: '#2563eb', color: '#2563eb' }}
                    onClick={() => {
                      expandAndShowDiff(n.agent, n.projectId)
                      clearNotification(n.projectId, n.agent)
                    }}
                  >
                    查看 Diff
                  </button>
                  <button
                    className="button"
                    style={{ padding: '2px 8px', fontSize: '12px' }}
                    onClick={async () => {
                      await handlePull(n.agent, n.projectId)
                      clearNotification(n.projectId, n.agent)
                    }}
                  >
                    同步到模板 (Pull) ↓
                  </button>
                  <button
                    className="button button-primary"
                    style={{ padding: '2px 8px', fontSize: '12px' }}
                    onClick={async () => {
                      await handlePush(n.agent, n.projectId)
                      clearNotification(n.projectId, n.agent)
                    }}
                  >
                    推送覆盖 (Push) ↑
                  </button>
                  <button
                    className="button"
                    style={{ padding: '2px 8px', fontSize: '12px', borderColor: '#cf222e', color: '#cf222e' }}
                    onClick={() => clearNotification(n.projectId, n.agent)}
                  >
                    忽略
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="toolbar">
        <h2>Rule 模板库</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '13px' }}>
            模板目录:{' '}
            <code style={{ background: '#f1f5f9', padding: '0 6px', borderRadius: '3px' }}>
              {tplDir?.absolute || tplDir?.raw || '(未配置)'}
            </code>
          </span>
          <button className="button" type="button" onClick={handleOpenTplDialog}>
            切换模板目录…
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setCreateAgent('claude')
              setCreateName('')
              setCreateMessage(null)
              setCreateDialogOpen(true)
            }}
          >
            + 新建模板
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setImportAgent('claude')
              setImportSourcePath('')
              setImportName('')
              setImportMessage(null)
              setImportDialogOpen(true)
            }}
          >
            + 导入模板
          </button>
        </div>
      </div>

      {tplDialogOpen && (
        <div className="modal-overlay" onClick={() => !tplSaving && setTplDialogOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '560px', width: '90%' }}
          >
            <div className="modal-header">
              <span>切换 Rule 模板目录</span>
              <button
                type="button"
                className="button"
                style={{ padding: '4px 8px' }}
                onClick={() => setTplDialogOpen(false)}
                disabled={tplSaving}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: '#57606a', fontSize: '13px', marginBottom: '16px' }}>
                切换后，本工具将在新目录下读取/写入 <code>library/rules</code> 形式的 Rule 模板（每个 agent 一份）。
                当前目录不存在时会自动创建。
              </p>

              <div className="form-group">
                <label htmlFor="rule-template-dir">Rule 模板根目录（绝对路径）</label>
                <DirectoryPicker
                  id="rule-template-dir"
                  value={tplNewPath}
                  onChange={(v) => {
                    setTplNewPath(v)
                    setTplMessage(null)
                  }}
                  placeholder="例如：D:\my-rules"
                  disabled={tplSaving}
                  hint="支持手动输入，或点击右侧 “选择目录…”（仅 Chromium 系列浏览器可返回绝对路径）。"
                />
              </div>

              {tplMessage && (
                <div
                  className="empty-state"
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    background: tplMessage.type === 'success' ? '#dafbe1' : '#ffebe9',
                    color: tplMessage.type === 'success' ? '#1a7f37' : '#cf222e',
                    border: tplMessage.type === 'success' ? '1px solid #c4f2d2' : '1px solid #ffc8c4',
                  }}
                >
                  {tplMessage.message}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="button" onClick={() => setTplDialogOpen(false)} disabled={tplSaving}>
                取消
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleSaveTplDir}
                disabled={tplSaving || !tplNewPath.trim()}
              >
                {tplSaving ? '保存中…' : '切换'}
              </button>
            </div>
          </div>
        </div>
      )}

      {createDialogOpen && (
        <div className="modal-overlay" onClick={() => !createSaving && setCreateDialogOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', width: '90%' }}
          >
            <div className="modal-header">
              <span>新建 Rule 规则模板</span>
              <button
                type="button"
                className="button"
                style={{ padding: '4px 8px' }}
                onClick={() => setCreateDialogOpen(false)}
                disabled={createSaving}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: '#57606a', fontSize: '13px', marginBottom: '16px' }}>
                在新模板中定义的规则会存放在本地模板库目录下。绑定到项目后，会自动转换为 Agent 所需的标准文件名。
              </p>

              <div className="form-group">
                <label>选择 Agent 类型</label>
                <select
                  className="form-input"
                  value={createAgent}
                  onChange={(e) => setCreateAgent(e.target.value as any)}
                  disabled={createSaving}
                >
                  <option value="claude">Claude (CLAUDE.md)</option>
                  <option value="codex">Codex (AGENTS.md)</option>
                  <option value="gemini">Gemini (GEMINI.md)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label htmlFor="create-rule-name">模板文件名</label>
                <input
                  id="create-rule-name"
                  type="text"
                  className="form-input"
                  placeholder="例如: react-frontend.md"
                  value={createName}
                  onChange={(e) => {
                    setCreateName(e.target.value)
                    setCreateMessage(null)
                  }}
                  disabled={createSaving}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  必须以 <code>.md</code> 结尾。系统会自动在模板中填入基础托管块标记。
                </span>
              </div>

              {createMessage && (
                <div
                  className="empty-state"
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    background: '#ffebe9',
                    color: '#cf222e',
                    border: '1px solid #ffc8c4',
                  }}
                >
                  {createMessage}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="button"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createSaving}
              >
                取消
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleCreateTemplate}
                disabled={createSaving || !createName.trim()}
              >
                {createSaving ? '创建中…' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importDialogOpen && (
        <div className="modal-overlay" onClick={() => !importSaving && setImportDialogOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px', width: '90%' }}
          >
            <div className="modal-header">
              <span>导入本地 Rule 规则模板</span>
              <button
                type="button"
                className="button"
                style={{ padding: '4px 8px' }}
                onClick={() => setImportDialogOpen(false)}
                disabled={importSaving}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: '#57606a', fontSize: '13px', marginBottom: '16px' }}>
                输入外部已有的规则文件（例如 <code>.md</code> 文件）的绝对路径，系统会将其拷贝为模板库中的自定义模板。
              </p>

              <div className="form-group">
                <label htmlFor="import-source-path">外部规则文件路径（绝对路径）</label>
                <input
                  id="import-source-path"
                  type="text"
                  className="form-input"
                  placeholder="例如: D:\my-old-project\CLAUDE.md"
                  value={importSourcePath}
                  onChange={(e) => handleSourcePathChange(e.target.value)}
                  disabled={importSaving}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  必须是本地可访问的 Markdown 文件绝对路径。
                </span>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>对应 Agent 类型</label>
                <select
                  className="form-input"
                  value={importAgent}
                  onChange={(e) => setImportAgent(e.target.value as any)}
                  disabled={importSaving}
                >
                  <option value="claude">Claude (CLAUDE.md)</option>
                  <option value="codex">Codex (AGENTS.md)</option>
                  <option value="gemini">Gemini (GEMINI.md)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label htmlFor="import-rule-name">目标模板名称</label>
                <input
                  id="import-rule-name"
                  type="text"
                  className="form-input"
                  placeholder="例如: imported-react-rules.md"
                  value={importName}
                  onChange={(e) => {
                    setImportName(e.target.value)
                    setImportMessage(null)
                  }}
                  disabled={importSaving}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  必须以 <code>.md</code> 结尾。如果源文件中不包含托管块标记，系统会自动将其包裹在托管块内。
                </span>
              </div>

              {importMessage && (
                <div
                  className="empty-state"
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    background: '#ffebe9',
                    color: '#cf222e',
                    border: '1px solid #ffc8c4',
                  }}
                >
                  {importMessage}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="button"
                onClick={() => setImportDialogOpen(false)}
                disabled={importSaving}
              >
                取消
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleImportTemplate}
                disabled={importSaving || !importSourcePath.trim() || !importName.trim()}
              >
                {importSaving ? '导入中…' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 项目规则绑定管理面板 */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#0f172a' }}>项目规则绑定管理</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>
          在此将您的项目规则关联到本地模板库中的自定义模板。新导入的项目默认为“未关联”，只有显式关联后系统才会进行比对与同步。
        </p>
        {!projectsData ? (
          <div className="empty-state" style={{ padding: '16px' }}>
            正在加载项目列表...
          </div>
        ) : (projectsData.projects || []).length === 0 ? (
          <div className="empty-state" style={{ padding: '16px' }}>
            未注册任何项目。请先前往<b>项目空间</b>页面注册项目。
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '8px', color: '#475569', fontWeight: 600 }}>项目名称</th>
                  <th style={{ padding: '8px', color: '#475569', fontWeight: 600 }}>项目路径</th>
                  <th style={{ padding: '8px', color: '#475569', fontWeight: 600, textAlign: 'center', width: '22%' }}>
                    Claude 规则关联
                  </th>
                  <th style={{ padding: '8px', color: '#475569', fontWeight: 600, textAlign: 'center', width: '22%' }}>
                    Codex 规则关联
                  </th>
                  <th style={{ padding: '8px', color: '#475569', fontWeight: 600, textAlign: 'center', width: '22%' }}>
                    Gemini 规则关联
                  </th>
                </tr>
              </thead>
              <tbody>
                {(projectsData.projects || []).map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px', fontWeight: 500, color: '#0f172a' }}>{p.name}</td>
                    <td style={{ padding: '8px', color: '#64748b', fontFamily: 'monospace', fontSize: '11px' }}>
                      {p.path}
                    </td>
                    {['claude', 'codex', 'gemini'].map((agent) => {
                      const currentTpl = p.ruleTemplates?.[agent] || ''
                      const agentTemplates = rules.filter((r: any) => r.agent === agent)
                      return (
                        <td key={agent} style={{ padding: '8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <select
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                cursor: 'pointer',
                                width: '100%',
                                maxWidth: '180px',
                              }}
                              value={currentTpl}
                              onChange={async (e) => {
                                const val = e.target.value
                                try {
                                  await apiPut(`/api/projects/${p.id}/rules/template`, {
                                    agent,
                                    templateName: val || null,
                                  })
                                  await refetch()
                                  await refetchProjects()
  
                                  // Clear cache and reload diff
                                  const k = keyFor(agent, p.id)
                                  setDiffByKey((s) => ({ ...s, [k]: null }))
                                  if (val) {
                                    await loadDiff(agent, p.id)
                                  }
                                } catch (err) {
                                  alert(`绑定规则模板失败: ${(err as Error).message}`)
                                }
                              }}
                            >
                              <option value="">(未关联)</option>
                              {Array.from(new Set(rules.map((r: any) => r.name))).map((name: any) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const ruleFileNames = {
                                claude: 'CLAUDE.md',
                                codex: 'AGENTS.md',
                                gemini: 'GEMINI.md',
                              }
                              const targetRuleName = ruleFileNames[agent as keyof typeof ruleFileNames]
                              const hasLocalFile = (p.scan?.ruleFiles || []).some(
                                (f: string) => f.endsWith(targetRuleName) || f.endsWith(targetRuleName.toLowerCase())
                              )
                              return (
                                <span style={{ fontSize: '11px', color: hasLocalFile ? '#16a34a' : '#94a3b8' }}>
                                  {hasLocalFile ? '● 本地已存在' : '○ 本地未创建'}
                                </span>
                              )
                            })()}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rules.length === 0 ? (
        <div className="empty-state">未注册任何 Rule 模板。</div>
      ) : (
        <div className="skill-list">
          {rules.map((rule) => {
            const tKey = `${rule.agent}:${rule.name}`
            const isOpen = !!expandedAgents[tKey]
            return (
              <div key={tKey} className="skill-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="skill-left" style={{ paddingRight: 0 }}>
                  <div className="skill-name-row">
                    <h4 className="skill-title">{rule.name}</h4>
                    <span className="skill-tag" style={agentStyle(rule.agent)}>
                      {rule.agent.toUpperCase()}
                    </span>
                    <span className="skill-tag" style={{ background: '#f1f5f9', color: '#475569' }}>
                      已注册项目: {rule.installedPaths.length}
                    </span>
                  </div>
                  <p
                    className="skill-desc"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      marginTop: '6px',
                      wordBreak: 'break-all',
                    }}
                    title={rule.localPath}
                  >
                    本地模板路径: {rule.localPath}
                  </p>
                  <div style={{ marginTop: '6px' }}>
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#2563eb',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '12px',
                        textDecoration: 'underline',
                      }}
                      onClick={() => setExpandedAgents((s) => ({ ...s, [tKey]: !s[tKey] }))}
                    >
                      {isOpen ? '收起已安装项目路径 ▴' : `查看项目级安装路径（${rule.installedPaths.length} 个项目）▾`}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {rule.installedPaths.map((p) => {
                        const k = keyFor(rule.agent, p.projectId)
                        const currentProjectId = activeProject[k] ?? p.projectId
                        const plan = diffByKey[k]
                        const sb = statusBadge(plan?.status)
                        const msg = syncMessage[k]
                        return (
                          <div
                            key={p.projectId}
                            id={`rule-row-${rule.agent}-${p.projectId}`}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              padding: '10px 12px',
                              transition: 'background-color 0.5s ease',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                                padding: '4px 0',
                              }}
                            >
                              <span
                                className="skill-tag"
                                style={{
                                  ...agentStyle(rule.agent),
                                  flexShrink: 0,
                                  minWidth: '90px',
                                  textAlign: 'center',
                                }}
                              >
                                {rule.agent.toUpperCase()} · project
                              </span>
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: '12px',
                                  color: '#1e293b',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <strong>{p.projectName}</strong>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    color: '#475569',
                                    wordBreak: 'break-all',
                                  }}
                                >
                                  {p.path}
                                </span>
                                <span
                                  style={{
                                    color: p.exists ? '#2f855a' : '#a0aec0',
                                  }}
                                >
                                  ({p.exists ? '已存在' : '未创建'})
                                </span>
                                <span style={{ color: '#64748b', marginLeft: '4px' }}>关联模板:</span>
                                <select
                                  style={{
                                    padding: '2px 4px',
                                    fontSize: '11px',
                                    borderRadius: '4px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    cursor: 'pointer',
                                  }}
                                  value={rule.name}
                                  onChange={async (e) => {
                                    const newTplName = e.target.value
                                    try {
                                      await apiPut(`/api/projects/${p.projectId}/rules/template`, {
                                        agent: rule.agent,
                                        templateName: newTplName || null,
                                      })
                                      await refetch()
                                      await refetchProjects()
                                      // Recalculate diff for the new combination
                                      const newKey = keyFor(rule.agent, p.projectId)
                                      setDiffByKey((s) => ({ ...s, [newKey]: null }))
                                      if (newTplName) {
                                        await loadDiff(rule.agent, p.projectId)
                                      }
                                    } catch (err) {
                                      alert(`绑定模板失败: ${(err as Error).message}`)
                                    }
                                  }}
                                >
                                  <option value="">(未关联)</option>
                                  {rules
                                    .filter((r: any) => r.agent === rule.agent)
                                    .map((r: any) => (
                                      <option key={r.name} value={r.name}>
                                        {r.name}
                                      </option>
                                    ))}
                                </select>
                              </span>
                              <button
                                className="button"
                                style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #cbd5e1' }}
                                onClick={() => {
                                  if (showDiffByKey[k]) {
                                    setShowDiffByKey((s) => ({ ...s, [k]: false }))
                                  } else {
                                    if (diffByKey[k]) {
                                      setShowDiffByKey((s) => ({ ...s, [k]: true }))
                                    } else {
                                      loadDiff(rule.agent, p.projectId)
                                    }
                                  }
                                }}
                                disabled={!!loadingDiff[k]}
                              >
                                {loadingDiff[k] ? '加载中…' : showDiffByKey[k] ? '收起 Diff' : '查看 Diff'}
                              </button>
                              <button
                                className="button"
                                style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #cbd5e1' }}
                                onClick={() => handlePull(rule.agent, p.projectId)}
                                disabled={!!isSyncing[k] || !p.exists}
                              >
                                拉取 ↓
                              </button>
                              <button
                                className="button button-primary"
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                onClick={() => handlePush(rule.agent, p.projectId)}
                                disabled={
                                  !!isSyncing[k] ||
                                  !plan ||
                                  plan.status === 'identical' ||
                                  (plan.status === 'conflict' && false)
                                }
                                title={plan?.status === 'conflict' ? '将执行 overwrite' : '将执行 block'}
                              >
                                推送 ↑ {plan?.status === 'conflict' ? '(overwrite)' : '(block)'}
                              </button>
                            </div>

                            {showDiffByKey[k] && plan && (
                              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                <span className={`badge ${sb.className}`}>{sb.label}</span>
                              </div>
                            )}
                            {showDiffByKey[k] && plan?.patch && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '4px',
                                }}
                              >
                                <DiffView diff={plan.patch} />
                              </div>
                            )}
                            {msg && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  fontSize: '12px',
                                  color: msg.startsWith('[成功]') ? '#1a7f37' : '#cf222e',
                                  background: msg.startsWith('[成功]') ? '#dafbe1' : '#ffebe9',
                                  border: msg.startsWith('[成功]') ? '1px solid #c4f2d2' : '1px solid #ffc8c4',
                                  padding: '6px 10px',
                                  borderRadius: '4px',
                                }}
                              >
                                {msg}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Rule scan control panel */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div>
          <h4
            style={{ margin: 0, fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>🔍 扫描项目规则文件变化（仅检测）</span>
            {isScanningRules && (
              <span style={{ fontSize: '12px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#2563eb',
                    display: 'inline-block',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
                正在扫描...
              </span>
            )}
          </h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
            手动点按右侧按钮，后台将即时比对所有已注册项目下的规则文件（CLAUDE.md / AGENTS.md /
            GEMINI.md）与本地权威模板的差异。
            {scanFinishedMessage && (
              <span style={{ color: '#1a7f37', marginLeft: '8px', fontWeight: 500 }}>{scanFinishedMessage}</span>
            )}
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={handleScanRules}
            disabled={isScanningRules}
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '6px',
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: '#ffffff',
              cursor: isScanningRules ? 'not-allowed' : 'pointer',
            }}
          >
            {isScanningRules ? '扫描中...' : '🔍 执行规则扫描'}
          </button>
        </div>
      </div>

      {/* Cross-agent sync matrix — per project */}
      {rules.length > 0 && rules[0].installedPaths.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ fontSize: '16px', color: '#17202a', marginBottom: '8px' }}>项目内跨 Agent 互推</h3>
          <p style={{ color: '#57606a', fontSize: '13px', marginBottom: '16px' }}>
            在同一项目内的 3 个 Agent 规则文件之间互相同步：选择源 Agent → 目标 Agent，
            把源文件中的内容（块模式提取，受控块；覆写模式整文件）推到目标 Agent 的项目级规则文件中。
            写入前会自动备份目标文件。
          </p>

          {Array.from(new Map(rules[0].installedPaths.map((p: InstalledPath) => [p.projectId, p])).values()).map(
            (proj: any) => {
              const isOpen = !!crossExpanded[proj.projectId]
              return (
                <div
                  key={proj.projectId}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: isOpen ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <div>
                      <strong>{proj.projectName}</strong>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          color: '#475569',
                          marginLeft: '8px',
                          fontSize: '12px',
                        }}
                      >
                        {proj.path}
                      </span>
                    </div>
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#2563eb',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textDecoration: 'underline',
                      }}
                      onClick={() => setCrossExpanded((s) => ({ ...s, [proj.projectId]: !s[proj.projectId] }))}
                    >
                      {isOpen ? '收起互推矩阵 ▴' : '展开互推矩阵 ▾'}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '12px 14px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>源 \ 目标</th>
                            {AGENTS.map((a) => (
                              <th key={a} style={{ textAlign: 'center', padding: '6px' }}>
                                <span className="skill-tag" style={agentStyle(a)}>
                                  {a.toUpperCase()}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {AGENTS.map((src) => (
                            <tr key={src}>
                              <td style={{ padding: '6px' }}>
                                <span className="skill-tag" style={agentStyle(src)}>
                                  {src.toUpperCase()}
                                </span>
                              </td>
                              {AGENTS.map((tgt) => {
                                if (src === tgt) {
                                  return (
                                    <td key={tgt} style={{ textAlign: 'center', color: '#a0aec0', fontSize: '12px' }}>
                                      —
                                    </td>
                                  )
                                }
                                const k = `cross:${proj.projectId}:${src}->${tgt}`
                                const msg = crossMessage[k]
                                const busy = !!crossInProgress[k]
                                return (
                                  <td key={tgt} style={{ textAlign: 'center', padding: '6px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                      <button
                                        className="button button-primary"
                                        style={{ padding: '4px 10px', fontSize: '11px' }}
                                        onClick={() => handleCrossSync(proj.projectId, src, tgt)}
                                        disabled={busy}
                                        title="完全覆写：源文件内容整文件覆盖写入目标规则文件"
                                      >
                                        {busy ? '正在互推...' : '推送覆盖'}
                                      </button>
                                    </div>
                                    {msg && (
                                      <div
                                        style={{
                                          marginTop: '4px',
                                          fontSize: '11px',
                                          color: msg.startsWith('[成功]') ? '#1a7f37' : '#cf222e',
                                        }}
                                      >
                                        {msg}
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            },
          )}
        </div>
      )}
    </section>
  )
}
