import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { apiGet, apiPost } from '../api/client'
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
      return { label: '未创建', className: 'badge-missing' }
    case 'identical':
      return { label: '已同步 (一致)', className: 'badge-identical' }
    case 'block':
      return { label: '待推送 (托管块)', className: 'badge-changed' }
    case 'conflict':
      return { label: '冲突 (无托管块)', className: 'badge-conflict' }
    default:
      return { label: status || '未知', className: 'badge-missing' }
  }
}

const AGENTS: Array<'claude' | 'codex' | 'gemini'> = ['claude', 'codex', 'gemini']

export function RulesPage() {
  const { data: rulesData, refetch, isLoading } = useApi<any>('rules', '/api/rules')
  const { data: tplDir, refetch: refetchTplDir } = useApi<any>('rule-template-dir', '/api/config/rule-template-dir')

  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [activeProject, setActiveProject] = useState<Record<string, string>>({})
  const [diffByKey, setDiffByKey] = useState<Record<string, any>>({})
  const [loadingDiff, setLoadingDiff] = useState<Record<string, boolean>>({})
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
        body: JSON.stringify({ path: tplNewPath.trim() })
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
  const [ruleNotifications, setRuleNotifications] = useState<Array<{ projectId: string; agent: string; lastDetectedAt: string }>>([])
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
    setExpandedAgents((prev) => ({ ...prev, [agent]: true }))
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
    return <div className="page"><div className="empty-state">正在加载 Rule 模板...</div></div>
  }

  const rules: RuleEntry[] = rulesData.rules || []

  const keyFor = (agent: string, projectId: string) => `${agent}:${projectId}`

  const loadDiff = async (agent: string, projectId: string) => {
    const k = keyFor(agent, projectId)
    setLoadingDiff((s) => ({ ...s, [k]: true }))
    try {
      const plan = await apiGet<any>(`/api/rules/diff?projectId=${projectId}&agent=${agent}`)
      setDiffByKey((s) => ({ ...s, [k]: plan }))
    } catch (err) {
      setSyncMessage((s) => ({ ...s, [k]: `加载 diff 失败: ${(err as Error).message}` }))
    } finally {
      setLoadingDiff((s) => ({ ...s, [k]: false }))
    }
  }

  const handlePush = async (agent: string, projectId: string) => {
    const k = keyFor(agent, projectId)
    const plan = diffByKey[k]
    const mode = plan?.status === 'conflict' ? 'overwrite' : 'block'
    try {
      setIsSyncing((s) => ({ ...s, [k]: true }))
      setSyncMessage((s) => ({ ...s, [k]: null }))
      await apiPost(`/api/projects/${projectId}/rules/sync`, { agent, mode })
      setSyncMessage((s) => ({ ...s, [k]: `[成功] 已推送到项目 (mode=${mode})` }))
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
    mode: 'block' | 'overwrite' = 'block'
  ) => {
    const k = `cross:${projectId}:${sourceAgent}->${targetAgent}`
    const verb = mode === 'overwrite' ? '完全覆写' : '替换托管块'
    if (!window.confirm(
      `是否确认互推同步？\n\n源: 项目内的 ${sourceAgent.toUpperCase()} 规则文件\n目标: 同项目的 ${targetAgent.toUpperCase()} 规则文件\n模式: ${verb}\n\n注：目标文件写入前会自动备份。`
    )) return
    try {
      setCrossInProgress((s) => ({ ...s, [k]: true }))
      setCrossMessage((s) => ({ ...s, [k]: null }))
      await apiPost(`/api/projects/${projectId}/rules/cross-sync`, {
        sourceAgent,
        targetAgent,
        mode
      })
      setCrossMessage((s) => ({ ...s, [k]: `[成功] ${sourceAgent.toUpperCase()} → ${targetAgent.toUpperCase()} (${mode})` }))
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
            gap: '8px'
          }}
        >
          <div style={{ fontWeight: 600, color: '#9a6700', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚠️ 规则变更提示 (仅检测)：</span>
            <span style={{ fontSize: '12px', fontWeight: 'normal' }}>
              检测到以下项目内 Agent 规则文件发生了变化。请选择操作（变更不自动覆写，必须手动确认）：
            </span>
          </div>
          {ruleNotifications.map((n) => {
            const projName = rules[0]?.installedPaths.find(p => p.projectId === n.projectId)?.projectName || n.projectId
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
                  fontSize: '13px'
                }}
              >
                <div>
                  <strong>{projName}</strong> 中的 <strong>{n.agent.toUpperCase()}</strong> 规则文件在{' '}
                  <span style={{ fontFamily: 'monospace' }}>
                    {new Date(n.lastDetectedAt).toLocaleTimeString()}
                  </span>{' '}
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
          <button
            className="button"
            type="button"
            onClick={handleOpenTplDialog}
          >
            切换模板目录…
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
                    border:
                      tplMessage.type === 'success' ? '1px solid #c4f2d2' : '1px solid #ffc8c4'
                  }}
                >
                  {tplMessage.message}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="button"
                onClick={() => setTplDialogOpen(false)}
                disabled={tplSaving}
              >
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

      {rules.length === 0 ? (
        <div className="empty-state">未注册任何 Rule 模板。</div>
      ) : (
        <div className="skill-list">
          {rules.map((rule) => {
            const isOpen = !!expandedAgents[rule.agent]
            return (
              <div key={rule.agent} className="skill-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
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
                      wordBreak: 'break-all'
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
                        textDecoration: 'underline'
                      }}
                      onClick={() =>
                        setExpandedAgents((s) => ({ ...s, [rule.agent]: !s[rule.agent] }))
                      }
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
                      borderRadius: '6px'
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
                              transition: 'background-color 0.5s ease'
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                                padding: '4px 0'
                              }}
                            >
                              <span
                                className="skill-tag"
                                style={{
                                  ...agentStyle(rule.agent),
                                  flexShrink: 0,
                                  minWidth: '90px',
                                  textAlign: 'center'
                                }}
                              >
                                {rule.agent.toUpperCase()} · project
                              </span>
                              <span style={{ flex: 1, fontSize: '12px', color: '#1e293b' }}>
                                <strong>{p.projectName}</strong>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    color: '#475569',
                                    marginLeft: '8px',
                                    wordBreak: 'break-all'
                                  }}
                                >
                                  {p.path}
                                </span>
                                <span style={{ marginLeft: '8px', color: p.exists ? '#2f855a' : '#a0aec0', fontSize: '12px' }}>
                                  {p.exists ? '已存在' : '未创建'}
                                </span>
                              </span>
                              <button
                                className="button"
                                style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #cbd5e1' }}
                                onClick={() => loadDiff(rule.agent, p.projectId)}
                                disabled={!!loadingDiff[k]}
                              >
                                {loadingDiff[k] ? '加载中…' : '查看 Diff'}
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

                            {plan && (
                              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                <span className={`badge ${sb.className}`}>{sb.label}</span>
                              </div>
                            )}
                            {plan?.patch && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '4px'
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
                                  borderRadius: '4px'
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
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}
      >
        <div>
          <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    animation: 'pulse 1.5s infinite' 
                  }} 
                />
                正在扫描...
              </span>
            )}
          </h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
            手动点按右侧按钮，后台将即时比对所有已注册项目下的规则文件（CLAUDE.md / AGENTS.md / GEMINI.md）与本地权威模板的差异。
            {scanFinishedMessage && <span style={{ color: '#1a7f37', marginLeft: '8px', fontWeight: 500 }}>{scanFinishedMessage}</span>}
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
              cursor: isScanningRules ? 'not-allowed' : 'pointer'
            }}
          >
            {isScanningRules ? '扫描中...' : '🔍 执行规则扫描'}
          </button>
        </div>
      </div>

      {/* Cross-agent sync matrix — per project */}
      {rules.length > 0 && rules[0].installedPaths.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ fontSize: '16px', color: '#17202a', marginBottom: '8px' }}>
            项目内跨 Agent 互推
          </h3>
          <p style={{ color: '#57606a', fontSize: '13px', marginBottom: '16px' }}>
            在同一项目内的 3 个 Agent 规则文件之间互相同步：选择源 Agent → 目标 Agent，
            把源文件中的内容（块模式提取，受控块；覆写模式整文件）推到目标 Agent 的项目级规则文件中。
            写入前会自动备份目标文件。
          </p>

          {Array.from(
            new Map(rules[0].installedPaths.map((p: InstalledPath) => [p.projectId, p])).values()
          ).map((proj: any) => {
            const isOpen = !!crossExpanded[proj.projectId]
            return (
              <div
                key={proj.projectId}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  marginBottom: '12px'
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: isOpen ? '1px solid #e2e8f0' : 'none'
                  }}
                >
                  <div>
                    <strong>{proj.projectName}</strong>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        color: '#475569',
                        marginLeft: '8px',
                        fontSize: '12px'
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
                      textDecoration: 'underline'
                    }}
                    onClick={() =>
                      setCrossExpanded((s) => ({ ...s, [proj.projectId]: !s[proj.projectId] }))
                    }
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
                                  <td
                                    key={tgt}
                                    style={{ textAlign: 'center', color: '#a0aec0', fontSize: '12px' }}
                                  >
                                    —
                                  </td>
                                )
                              }
                              const k = `cross:${proj.projectId}:${src}->${tgt}`
                              const msg = crossMessage[k]
                              const busy = !!crossInProgress[k]
                              return (
                                <td key={tgt} style={{ textAlign: 'center', padding: '6px' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                    <button
                                      className="button"
                                      style={{ padding: '2px 8px', fontSize: '12px', border: '1px solid #cbd5e1' }}
                                      onClick={() => handleCrossSync(proj.projectId, src, tgt, 'block')}
                                      disabled={busy}
                                      title="块模式：复用源文件受控块，推入目标 Agent 的受控块"
                                    >
                                      block
                                    </button>
                                    <button
                                      className="button"
                                      style={{ padding: '2px 8px', fontSize: '12px' }}
                                      onClick={() => handleCrossSync(proj.projectId, src, tgt, 'overwrite')}
                                      disabled={busy}
                                      title="覆写模式：源文件整文件覆写目标"
                                    >
                                      overwrite
                                    </button>
                                  </div>
                                  {msg && (
                                    <div
                                      style={{
                                        marginTop: '4px',
                                        fontSize: '11px',
                                        color: msg.startsWith('[成功]') ? '#1a7f37' : '#cf222e'
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
          })}
        </div>
      )}
    </section>
  )
}