import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { apiGet, apiPost, apiPut } from '../api/client'
import { PlanResult } from '../components/PlanConfirmDialog'
import { DiffView } from '../components/DiffView'

interface ProjectDetail {
  id: string
  name: string
  path: string
  enabledAgents: string[]
  scan?: { projectId: string; skillDirs: string[]; ruleFiles: string[] }
  ruleTemplates?: Record<string, string>
}

interface SkillSummary {
  name: string
  version: string
}

interface RuleDiffResult {
  status: 'create' | 'identical' | 'block' | 'conflict'
  exists: boolean
  templateName?: string
  patch?: string
  currentContent?: string
  templateContent?: string
  expectedContent?: string
}

interface ProjectScanResult {
  projectId: string
  skillDirs: string[]
  ruleFiles: string[]
  scannedAt: string
}

const AGENT_RULE_FILE: Record<string, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
}

const AGENT_TAG_STYLE: Record<string, { background: string; color: string }> = {
  claude: { background: '#fdf0ec', color: '#c05621' },
  codex: { background: '#ebfbee', color: '#2f855a' },
  gemini: { background: '#ebf8ff', color: '#2b6cb0' },
}

function getRuleStatusMeta(status?: string) {
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

export function ProjectWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    data: projectsData,
    isLoading: projectsLoading,
    refetch: refetchProjects,
  } = useApi<{ projects: ProjectDetail[] }>('projects', '/api/projects')
  const { data: skillsData } = useApi<{ skills: SkillSummary[] }>('skills', '/api/skills')
  const { data: rulesData } = useApi<any>('rules', '/api/rules')

  const project = useMemo(
    () => (projectsData?.projects || []).find((p) => p.id === id) || null,
    [projectsData, id],
  )
  const rules = rulesData?.rules || []

  // ----- Skill inject state -----
  const [selectedSkillName, setSelectedSkillName] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [injectPlanResult, setInjectPlanResult] = useState<PlanResult | null>(null)
  const [allowManagedModify, setAllowManagedModify] = useState(false)
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false)
  const [planErrorMessage, setPlanErrorMessage] = useState<string | null>(null)
  const [injectSuccessMessage, setInjectSuccessMessage] = useState<string | null>(null)

  // ----- Rule sync state -----
  const [ruleDiffs, setRuleDiffs] = useState<Record<string, RuleDiffResult | null>>({})
  const [ruleOverwrites, setRuleOverwrites] = useState<Record<string, boolean>>({})
  const [fetchingRuleDiffs, setFetchingRuleDiffs] = useState<Record<string, boolean>>({})
  const [syncingRules, setSyncingRules] = useState<Record<string, boolean>>({})
  const [ruleMessages, setRuleMessages] = useState<Record<string, { kind: 'success' | 'error'; text: string } | null>>({})

  // ----- Local single-project scan state (overrides project.scan for rendering) -----
  const [localScan, setLocalScan] = useState<ProjectScanResult | null>(null)
  const [isRescanning, setIsRescanning] = useState(false)
  const [rescanError, setRescanError] = useState<string | null>(null)

  // Initialise per-project defaults once the project is resolved.
  useEffect(() => {
    if (!project) return
    setSelectedAgent(project.enabledAgents?.[0] || 'claude')
    setSelectedSkillName('')
    setInjectPlanResult(null)
    setPlanErrorMessage(null)
    setInjectSuccessMessage(null)
    setAllowManagedModify(false)
    setRuleDiffs({})
    setRuleOverwrites({})
    setRuleMessages({})
    setFetchingRuleDiffs({})
    setSyncingRules({})
    setLocalScan(null)
    setRescanError(null)

    // 同时获取 3 个 Agent 规则的差异
    fetchRuleDiff(project.id, 'claude')
    fetchRuleDiff(project.id, 'codex')
    fetchRuleDiff(project.id, 'gemini')
  }, [project?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const skills = skillsData?.skills || []
  const effectiveScan = localScan ?? project?.scan
  const skillDirs = effectiveScan?.skillDirs || []
  const ruleFiles = effectiveScan?.ruleFiles || []

  // ----- Skill inject handlers -----
  const handleGeneratePlan = async () => {
    if (!project || !selectedSkillName || !selectedAgent) return
    try {
      setIsSubmittingPlan(true)
      setPlanErrorMessage(null)
      setInjectSuccessMessage(null)
      const res = await apiPost<PlanResult>(`/api/projects/${project.id}/inject/plan`, {
        skillName: selectedSkillName,
        agent: selectedAgent,
      })
      setInjectPlanResult(res)
    } catch (err) {
      setPlanErrorMessage((err as Error).message)
      setInjectPlanResult(null)
    } finally {
      setIsSubmittingPlan(false)
    }
  }

  const handleConfirmInject = async () => {
    if (!project || !injectPlanResult) return
    try {
      setIsSubmittingPlan(true)
      setPlanErrorMessage(null)
      await apiPost(`/api/projects/${project.id}/inject/apply`, {
        planId: injectPlanResult.plan.planId,
        allowManagedModify,
      })
      setInjectSuccessMessage(`Skill "${selectedSkillName}" 已成功注入到项目 "${project.name}"。`)
      setInjectPlanResult(null)
      setAllowManagedModify(false)
      await refetchProjects()
    } catch (err) {
      setPlanErrorMessage((err as Error).message)
    } finally {
      setIsSubmittingPlan(false)
    }
  }

  // ----- Rule sync handlers -----
  const fetchRuleDiff = async (projectId: string, agent: string, overrideTemplateName?: string) => {
    const templateName = overrideTemplateName !== undefined ? overrideTemplateName : project?.ruleTemplates?.[agent]
    if (!templateName) {
      setRuleDiffs((s) => ({ ...s, [agent]: null }))
      setFetchingRuleDiffs((s) => ({ ...s, [agent]: false }))
      setRuleMessages((s) => ({ ...s, [agent]: null }))
      return
    }

    try {
      setFetchingRuleDiffs((s) => ({ ...s, [agent]: true }))
      setRuleMessages((s) => ({ ...s, [agent]: null }))
      const res = await apiGet<RuleDiffResult>(`/api/projects/${projectId}/rules/diff?agent=${agent}`)
      setRuleDiffs((s) => ({ ...s, [agent]: res }))
    } catch (err) {
      setRuleDiffs((s) => ({ ...s, [agent]: null }))
      setRuleMessages((s) => ({
        ...s,
        [agent]: { kind: 'error', text: `获取规则 Diff 失败: ${(err as Error).message}` },
      }))
    } finally {
      setFetchingRuleDiffs((s) => ({ ...s, [agent]: false }))
    }
  }

  const handlePushRules = async (agent: string) => {
    if (!project) return
    const diff = ruleDiffs[agent]
    if (!diff) return
    const mode = 'overwrite'
    try {
      setSyncingRules((s) => ({ ...s, [agent]: true }))
      setRuleMessages((s) => ({ ...s, [agent]: null }))
      await apiPost(`/api/projects/${project.id}/rules/sync`, {
        agent,
        mode,
      })
      setRuleMessages((s) => ({
        ...s,
        [agent]: { kind: 'success', text: `规则已成功推送至项目 "${project.name}"。` },
      }))
      await fetchRuleDiff(project.id, agent)
      await refetchProjects()
    } catch (err) {
      setRuleMessages((s) => ({
        ...s,
        [agent]: { kind: 'error', text: `推送规则失败: ${(err as Error).message}` },
      }))
    } finally {
      setSyncingRules((s) => ({ ...s, [agent]: false }))
    }
  }

  const handlePullRules = async (agent: string) => {
    if (!project) return
    const confirmMsg = `是否确认从项目拉取规则？这将覆写更新本地的权威 ${agent} 模板。`
    if (!window.confirm(confirmMsg)) return
    try {
      setSyncingRules((s) => ({ ...s, [agent]: true }))
      setRuleMessages((s) => ({ ...s, [agent]: null }))
      await apiPost(`/api/projects/${project.id}/rules/sync`, {
        agent,
        mode: 'pull',
      })
      setRuleMessages((s) => ({
        ...s,
        [agent]: { kind: 'success', text: `已从项目拉取最新规则，并更新本地权威模板。` },
      }))
      await fetchRuleDiff(project.id, agent)
    } catch (err) {
      setRuleMessages((s) => ({
        ...s,
        [agent]: { kind: 'error', text: `拉取规则失败: ${(err as Error).message}` },
      }))
    } finally {
      setSyncingRules((s) => ({ ...s, [agent]: false }))
    }
  }

  const handleRescan = async () => {
    // POST /api/projects/:id/scan — re-scans ONLY this project (not the whole list).
    // We refresh the global list in the background so the ProjectSpacePage card
    // mirrors the new state too, but the workspace view's source of truth for
    // path rendering is the dedicated single-project scan response.
    if (!project) return
    try {
      setIsRescanning(true)
      setRescanError(null)
      const res = await apiPost<ProjectScanResult>(`/api/projects/${project.id}/scan`)
      setLocalScan(res)
      await refetchProjects()
    } catch (err) {
      setRescanError((err as Error).message)
    } finally {
      setIsRescanning(false)
    }
  }

  // ----- Render -----
  if (projectsLoading && !projectsData) {
    return (
      <section className="page">
        <div className="empty-state">正在加载项目...</div>
      </section>
    )
  }

  if (!project) {
    return (
      <section className="page">
        <div className="toolbar">
          <button className="button" onClick={() => navigate('/projects')}>
            返回项目空间
          </button>
        </div>
        <div className="empty-state">
          项目不存在或已被移除。<button className="button" onClick={() => navigate('/projects')}>返回</button>
        </div>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="toolbar">
        <button className="button" style={{ border: '1px solid #cbd5e1' }} onClick={() => navigate('/projects')}>
          ← 返回项目空间
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h2 style={{ margin: 0 }}>{project.name}</h2>
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
            <span style={{ fontFamily: 'monospace' }}>ID: {project.id}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 6 }}>
            {project.enabledAgents.map((agent) => (
              <span
                key={agent}
                className="skill-tag"
                style={AGENT_TAG_STYLE[agent] || { background: '#f1f5f9', color: '#475569' }}
              >
                {agent.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
        <button
          className="button"
          style={{ border: '1px solid #cbd5e1' }}
          onClick={handleRescan}
          disabled={isRescanning}
        >
          {isRescanning ? '扫描中...' : '重新扫描'}
        </button>
      </div>

      {rescanError && (
        <div
          style={{
            background: '#ffebe9',
            border: '1px solid #ffc8c4',
            color: '#b91c1c',
            padding: '10px 12px',
            borderRadius: 6,
            fontSize: 13,
            marginTop: 12,
          }}
        >
          重新扫描失败: {rescanError}
        </div>
      )}

      {/* ---------- 1. 项目基本信息卡 ---------- */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          marginTop: 16,
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: 14, color: '#1e293b' }}>项目基本信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 8, columnGap: 12, fontSize: 13 }}>
          <div style={{ color: '#64748b' }}>物理路径</div>
          <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{project.path}</div>

          <div style={{ color: '#64748b' }}>启用 Agent</div>
          <div>
            {project.enabledAgents.length === 0
              ? <span style={{ color: '#94a3b8' }}>（无）</span>
              : project.enabledAgents.map((a) => (
                  <span
                    key={a}
                    className="skill-tag"
                    style={{ ...(AGENT_TAG_STYLE[a] || { background: '#f1f5f9', color: '#475569' }), marginRight: 6 }}
                  >
                    {a.toUpperCase()} ({AGENT_RULE_FILE[a] || a})
                  </span>
                ))}
          </div>

          <div style={{ color: '#64748b' }}>扫描结果</div>
          <div>
            <span>检测到 Skill 目录 <strong>{skillDirs.length}</strong> 个</span>
            <span style={{ marginLeft: 16 }}>检测到 Rule 文件 <strong>{ruleFiles.length}</strong> 个</span>
            {localScan && (
              <span style={{ marginLeft: 16, color: '#2563eb' }}>
                最后扫描时间：{new Date(localScan.scannedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- 2. 项目级 Skill 与 Rule 文件状态总览 ---------- */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          marginTop: 16,
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: 14, color: '#1e293b' }}>项目级 Skill 与 Rule 文件状态</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
          以下为本项目磁盘上已被检测到的项目级 Skill 目录与 Agent 规则文件绝对路径。
        </p>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: '#475569' }}>Skill 目录：</div>
          {skillDirs.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 12, paddingLeft: 8 }}>(无)</div>
          ) : (
            skillDirs.map((dir, i) => (
              <div
                key={`s-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 0',
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
              >
                <span style={{ flex: 1, wordBreak: 'break-all', minWidth: 0, color: '#1e293b' }}>{dir}</span>
              </div>
            ))
          )}
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: '#475569' }}>Rule 文件：</div>
          {ruleFiles.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 12, paddingLeft: 8 }}>(无)</div>
          ) : (
            ruleFiles.map((file, i) => (
              <div
                key={`r-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 0',
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
              >
                <span style={{ flex: 1, wordBreak: 'break-all', minWidth: 0, color: '#1e293b' }}>{file}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ---------- 3. 技能注入区 ---------- */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          marginTop: 16,
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: 14, color: '#1e293b' }}>技能注入</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
          把本地库中的 Skill 推送到本项目的 Agent 目录（如 <code>.claude/skills</code>、<code>.agents/skills</code>）。
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label>选择要注入的 Skill</label>
            <select
              className="form-input"
              value={selectedSkillName}
              onChange={(e) => {
                setSelectedSkillName(e.target.value)
                setInjectPlanResult(null)
                setInjectSuccessMessage(null)
              }}
              disabled={isSubmittingPlan}
            >
              <option value="">-- 请选择 --</option>
              {skills.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} (v{s.version})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label>目标 Agent</label>
            <select
              className="form-input"
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value)
                setInjectPlanResult(null)
              }}
              disabled={isSubmittingPlan}
            >
              {project.enabledAgents.map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!injectPlanResult && (
          <div style={{ textAlign: 'right' }}>
            <button
              className="button button-primary"
              onClick={handleGeneratePlan}
              disabled={isSubmittingPlan || !selectedSkillName || !selectedAgent}
            >
              {isSubmittingPlan ? '正在生成计划...' : '生成注入计划'}
            </button>
          </div>
        )}

        {planErrorMessage && (
          <div
            style={{
              background: '#ffebe9',
              border: '1px solid #ffc8c4',
              color: '#b91c1c',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 13,
              marginTop: 12,
            }}
          >
            {planErrorMessage}
          </div>
        )}

        {injectSuccessMessage && (
          <div
            style={{
              background: '#ebfbee',
              border: '1px solid #c6f6d5',
              color: '#22543d',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 13,
              marginTop: 12,
            }}
          >
            {injectSuccessMessage}
          </div>
        )}

        {injectPlanResult && (
          <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#1e293b' }}>同步计划预览</h4>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <span className="badge badge-missing" style={{ background: '#e1f5fe', color: '#0288d1' }}>
                新增: {injectPlanResult.summary.create}
              </span>
              <span className="badge badge-changed">修改: {injectPlanResult.summary.modify}</span>
              <span className="badge badge-identical">跳过: {injectPlanResult.summary.skip}</span>
              <span className="badge badge-conflict">冲突: {injectPlanResult.summary.conflict}</span>
            </div>

            {injectPlanResult.summary.conflict > 0 && (
              <div
                style={{
                  background: '#fffbeb',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #fef3c7',
                  marginBottom: 12,
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={allowManagedModify}
                    onChange={(e) => setAllowManagedModify(e.target.checked)}
                    disabled={isSubmittingPlan}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#b45309' }}>
                    允许覆写冲突文件 (--allow-managed-modify)
                  </span>
                </label>
              </div>
            )}

            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>变更细节：</div>
            <div
              style={{
                border: '1px solid #e6ebf1',
                borderRadius: 6,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {injectPlanResult.plan.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom:
                      idx < injectPlanResult.plan.items.length - 1 ? '1px solid #e6ebf1' : 'none',
                    fontSize: 12,
                  }}
                >
                  <div style={{ color: '#475569', wordBreak: 'break-all', paddingRight: 12 }}>
                    {item.target}
                  </div>
                  <span
                    className={`badge badge-${
                      item.kind === 'skip'
                        ? 'identical'
                        : item.kind === 'modify'
                          ? 'changed'
                          : item.kind
                    }`}
                  >
                    {item.kind === 'create'
                      ? '新增'
                      : item.kind === 'modify'
                        ? '修改'
                        : item.kind === 'skip'
                          ? '跳过'
                          : '冲突'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="button"
                onClick={() => {
                  setInjectPlanResult(null)
                  setAllowManagedModify(false)
                }}
                disabled={isSubmittingPlan}
              >
                取消
              </button>
              <button
                className="button button-primary"
                onClick={handleConfirmInject}
                disabled={
                  isSubmittingPlan ||
                  (injectPlanResult.summary.create === 0 && injectPlanResult.summary.modify === 0) ||
                  (injectPlanResult.summary.conflict > 0 && !allowManagedModify)
                }
              >
                {isSubmittingPlan ? '正在应用...' : '确认注入'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- 4. AI 规则同步区 ---------- */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: 14, color: '#1e293b' }}>AI 规则同步</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
          比对本地规则模板与项目根目录下的 <code>CLAUDE.md</code> / <code>AGENTS.md</code> / <code>GEMINI.md</code>，
          推送模板、或从项目拉取回模板。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {['claude', 'codex', 'gemini'].map((agent) => {
            const ruleDiff = ruleDiffs[agent]
            const isFetchingRuleDiff = fetchingRuleDiffs[agent]
            const isSyncingRule = syncingRules[agent]
            const ruleOverwrite = ruleOverwrites[agent] || false
            const ruleMessage = ruleMessages[agent]

            return (
              <div
                key={agent}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  background: '#f8fafc',
                }}
              >
                {/* 卡片头部 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: 10,
                    marginBottom: 12,
                  }}
                >
                  <span
                    className="skill-tag"
                    style={{
                      ...(AGENT_TAG_STYLE[agent] || { background: '#f1f5f9', color: '#475569' }),
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {agent.toUpperCase()} 规则 ({AGENT_RULE_FILE[agent]})
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {ruleDiff && (
                      <span className={`badge ${getRuleStatusMeta(ruleDiff.status).className}`}>
                        {getRuleStatusMeta(ruleDiff.status).label}
                      </span>
                    )}
                    {(() => {
                      const ruleFileNames = {
                        claude: 'CLAUDE.md',
                        codex: 'AGENTS.md',
                        gemini: 'GEMINI.md',
                      }
                      const targetRuleName = ruleFileNames[agent as keyof typeof ruleFileNames]
                      const hasLocalFile = ruleFiles.some(
                        (f: string) => f.endsWith(targetRuleName) || f.endsWith(targetRuleName.toLowerCase())
                      )
                      return (
                        <span style={{ fontSize: '12px', color: hasLocalFile ? '#16a34a' : '#94a3b8' }}>
                          {hasLocalFile ? '● 本地已存在' : '○ 本地未创建'}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* 控制栏：关联模板与同步按钮 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, marginBottom: 12 }}>
                  <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
                    <label style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>关联的规则模板</label>
                    <select
                      className="form-input"
                      value={project.ruleTemplates?.[agent] || ''}
                      onChange={async (e) => {
                        const val = e.target.value
                        try {
                          await apiPut(`/api/projects/${project.id}/rules/template`, {
                            agent,
                            templateName: val || null,
                          })
                          await refetchProjects()
                          setRuleDiffs((s) => ({ ...s, [agent]: null }))
                          await fetchRuleDiff(project.id, agent, val)
                        } catch (err) {
                          alert(`绑定规则模板失败: ${(err as Error).message}`)
                        }
                      }}
                      disabled={isFetchingRuleDiff || isSyncingRule}
                      style={{ padding: '6px 10px', fontSize: 13 }}
                    >
                      <option value="">(未关联)</option>
                      {Array.from(new Set(rules.map((r: any) => r.name))).map((name: any) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="button"
                      style={{ border: '1px solid #cbd5e1', padding: '6px 12px', fontSize: 13 }}
                      onClick={() => handlePullRules(agent)}
                      disabled={isFetchingRuleDiff || isSyncingRule || !ruleDiff?.exists}
                    >
                      拉取规则 ↓
                    </button>
                    <button
                      className="button button-primary"
                      style={{ padding: '6px 12px', fontSize: 13 }}
                      onClick={() => handlePushRules(agent)}
                      disabled={
                        isFetchingRuleDiff ||
                        isSyncingRule ||
                        !ruleDiff ||
                        ruleDiff.status === 'identical'
                      }
                    >
                      {isSyncingRule ? '正在同步...' : '推送模板 ↑'}
                    </button>
                  </div>
                </div>

                {/* 状态为空或未关联时的提示 */}
                {!ruleDiff && (
                  <div className="empty-state" style={{ padding: '12px 0' }}>
                    {project.ruleTemplates?.[agent] ? '正在获取同步状态...' : '项目此 Agent 暂未关联规则模板。'}
                  </div>
                )}

                {/* 提示消息 */}
                {ruleMessage && (
                  <div
                    style={{
                      marginTop: 12,
                      background: ruleMessage.kind === 'success' ? '#ebfbee' : '#ffebe9',
                      border: `1px solid ${ruleMessage.kind === 'success' ? '#c6f6d5' : '#ffc8c4'}`,
                      color: ruleMessage.kind === 'success' ? '#22543d' : '#b91c1c',
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    {ruleMessage.text}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
