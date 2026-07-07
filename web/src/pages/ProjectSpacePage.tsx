import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { apiPost, apiGet } from '../api/client'
import { PlanResult } from '../components/PlanConfirmDialog'
import { DiffView } from '../components/DiffView'
import { DirectoryPicker } from '../components/DirectoryPicker'

export function ProjectSpacePage() {
  const { data: projectsData, refetch, isLoading } = useApi<any>('projects', '/api/projects')
  const { data: skillsData } = useApi<any>('skills', '/api/skills')

  // Per-project "show installed paths" expansion state
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})

  // Add Project Dialog State
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // Dialog Mode & State
  const [injectDialogOpen, setInjectDialogOpen] = useState(false)
  const [activeDialogTab, setActiveDialogTab] = useState<'skills' | 'rules'>('skills')
  const [selectedProject, setSelectedProject] = useState<any | null>(null)

  // Skills Tab State
  const [selectedSkillName, setSelectedSkillName] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [injectPlanResult, setInjectPlanResult] = useState<PlanResult | null>(null)
  const [allowManagedModify, setAllowManagedModify] = useState(false)
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false)
  const [planErrorMessage, setPlanErrorMessage] = useState<string | null>(null)

  // Rules Tab State
  const [selectedRuleAgent, setSelectedRuleAgent] = useState('')
  const [ruleDiff, setRuleDiff] = useState<any | null>(null)
  const [ruleOverwrite, setRuleOverwrite] = useState(false)
  const [isFetchingRuleDiff, setIsFetchingRuleDiff] = useState(false)
  const [isSyncingRule, setIsSyncingRule] = useState(false)

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectName.trim() || !projectPath.trim()) return

    try {
      setIsAdding(true)
      await apiPost('/api/projects', {
        name: projectName.trim(),
        path: projectPath.trim()
      })
      alert(`[成功] 项目 "${projectName}" 注册成功！`)
      setAddDialogOpen(false)
      setProjectName('')
      setProjectPath('')
      await refetch()
    } catch (err) {
      alert(`添加项目失败: ${(err as Error).message}`)
    } finally {
      setIsAdding(false)
    }
  }

  const fetchRuleDiff = async (projectId: string, agent: string) => {
    try {
      setIsFetchingRuleDiff(true)
      const res = await apiGet<any>(`/api/projects/${projectId}/rules/diff?agent=${agent}`)
      setRuleDiff(res)
    } catch (err) {
      alert(`获取规则 Diff 失败: ${(err as Error).message}`)
      setRuleDiff(null)
    } finally {
      setIsFetchingRuleDiff(false)
    }
  }

  const handleOpenInjectDialog = (project: any) => {
    setSelectedProject(project)
    setInjectDialogOpen(true)
    setActiveDialogTab('skills')

    // Reset skills state
    setSelectedSkillName('')
    setSelectedAgent(project.enabledAgents?.[0] || 'claude')
    setInjectPlanResult(null)
    setPlanErrorMessage(null)
    setAllowManagedModify(false)

    // Reset rules state
    const defaultRuleAgent = project.enabledAgents?.[0] || 'claude'
    setSelectedRuleAgent(defaultRuleAgent)
    setRuleOverwrite(false)
    setRuleDiff(null)
    fetchRuleDiff(project.id, defaultRuleAgent)
  }

  const handleRuleAgentChange = (agent: string) => {
    setSelectedRuleAgent(agent)
    setRuleOverwrite(false)
    setRuleDiff(null)
    if (selectedProject) {
      fetchRuleDiff(selectedProject.id, agent)
    }
  }

  const handleGeneratePlan = async () => {
    if (!selectedProject || !selectedSkillName || !selectedAgent) return

    try {
      setIsSubmittingPlan(true)
      setPlanErrorMessage(null)
      const res = await apiPost<PlanResult>(`/api/projects/${selectedProject.id}/inject/plan`, {
        skillName: selectedSkillName,
        agent: selectedAgent
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
    if (!selectedProject || !injectPlanResult) return

    try {
      setIsSubmittingPlan(true)
      setPlanErrorMessage(null)
      await apiPost(`/api/projects/${selectedProject.id}/inject/apply`, {
        planId: injectPlanResult.plan.planId,
        allowManagedModify
      })
      alert(`[成功] Skill 成功注入到项目 "${selectedProject.name}"！`)
      setInjectDialogOpen(false)
      setInjectPlanResult(null)
      await refetch()
    } catch (err) {
      setPlanErrorMessage((err as Error).message)
    } finally {
      setIsSubmittingPlan(false)
    }
  }

  const handlePushRules = async () => {
    if (!selectedProject || !selectedRuleAgent || !ruleDiff) return
    const mode = ruleDiff.status === 'conflict' ? 'overwrite' : 'block'

    try {
      setIsSyncingRule(true)
      await apiPost(`/api/projects/${selectedProject.id}/rules/sync`, {
        agent: selectedRuleAgent,
        mode
      })
      alert(`[成功] 规则已成功推送至项目 "${selectedProject.name}"！`)
      await fetchRuleDiff(selectedProject.id, selectedRuleAgent)
    } catch (err) {
      alert(`推送规则失败: ${(err as Error).message}`)
    } finally {
      setIsSyncingRule(false)
    }
  }

  const handlePullRules = async () => {
    if (!selectedProject || !selectedRuleAgent) return
    const confirmMsg = `是否确认从项目拉取规则？这将覆写更新本地的权威 ${selectedRuleAgent} 模板。`
    if (!window.confirm(confirmMsg)) return

    try {
      setIsSyncingRule(true)
      await apiPost(`/api/projects/${selectedProject.id}/rules/sync`, {
        agent: selectedRuleAgent,
        mode: 'pull'
      })
      alert(`[成功] 已成功从项目拉取最新规则，并更新本地权威模板！`)
      await fetchRuleDiff(selectedProject.id, selectedRuleAgent)
    } catch (err) {
      alert(`拉取规则失败: ${(err as Error).message}`)
    } finally {
      setIsSyncingRule(false)
    }
  }

  if (isLoading || !projectsData) {
    return <div className="page"><div className="empty-state">正在加载项目列表...</div></div>
  }

  const projects = projectsData.projects || []
  const skills = skillsData?.skills || []

  const getAgentTagStyle = (agent: string) => {
    if (agent === 'claude') return { background: '#fdf0ec', color: '#c05621' }
    if (agent === 'codex') return { background: '#ebfbee', color: '#2f855a' }
    if (agent === 'gemini') return { background: '#ebf8ff', color: '#2b6cb0' }
    return { background: '#faf5ff', color: '#6b46c1' }
  }

  const getRuleStatusLabelAndStyle = (status: string) => {
    switch (status) {
      case 'create':
        return { label: '未创建', className: 'badge-missing' }
      case 'identical':
        return { label: '已同步 (一致)', className: 'badge-identical' }
      case 'block':
        return { label: '待推送 (仅同步托管块)', className: 'badge-changed' }
      case 'conflict':
        return { label: '冲突 (无托管块)', className: 'badge-conflict' }
      default:
        return { label: status || '未知', className: 'badge-missing' }
    }
  }

  return (
    <section className="page">
      <div className="toolbar">
        <h2>项目空间</h2>
        <button className="button button-primary" type="button" onClick={() => setAddDialogOpen(true)}>
          添加项目
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">未注册任何项目。点击右上角“添加项目”进行注册。</div>
      ) : (
        <div className="skill-list">
          {projects.map((project: any) => (
            <div key={project.id} className="skill-row">
              <div className="skill-left">
                <div className="skill-name-row">
                  <h4 className="skill-title">{project.name}</h4>
                  <span className="skill-tag" style={{ background: '#f1f5f9', color: '#475569' }}>
                    ID: {project.id}
                  </span>
                  {project.enabledAgents.map((agent: string) => (
                    <span key={agent} className="skill-tag" style={getAgentTagStyle(agent)}>
                      {agent.toUpperCase()}
                    </span>
                  ))}
                </div>
                <p className="skill-desc" style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '6px' }}>
                  物理路径: {project.path}
                </p>
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                  <span>检测到 Skill 目录: <strong>{project.scan?.skillDirs?.length || 0}</strong> 个</span>
                  <span>检测到 Rule 文件: <strong>{project.scan?.ruleFiles?.length || 0}</strong> 个</span>
                  {(project.scan?.skillDirs?.length || 0) + (project.scan?.ruleFiles?.length || 0) > 0 && (
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
                        setExpandedProjects((prev) => ({
                          ...prev,
                          [project.id]: !prev[project.id]
                        }))
                      }
                    >
                      {expandedProjects[project.id] ? '收起路径 ▴' : '查看已安装路径 ▾'}
                    </button>
                  )}
                </div>
                {expandedProjects[project.id] && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 10px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  >
                    {(project.scan?.skillDirs?.length || 0) > 0 && (
                      <div style={{ marginBottom: '4px' }}>
                        <span style={{ color: '#475569', fontWeight: 600 }}>Skill 目录：</span>
                        {project.scan.skillDirs.map((dir: string, i: number) => (
                          <div
                            key={`s-${i}`}
                            style={{
                              fontFamily: 'monospace',
                              color: '#1e293b',
                              wordBreak: 'break-all',
                              paddingLeft: '12px'
                            }}
                          >
                            {dir}
                          </div>
                        ))}
                      </div>
                    )}
                    {(project.scan?.ruleFiles?.length || 0) > 0 && (
                      <div>
                        <span style={{ color: '#475569', fontWeight: 600 }}>Rule 文件：</span>
                        {project.scan.ruleFiles.map((file: string, i: number) => (
                          <div
                            key={`r-${i}`}
                            style={{
                              fontFamily: 'monospace',
                              color: '#1e293b',
                              wordBreak: 'break-all',
                              paddingLeft: '12px'
                            }}
                          >
                            {file}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="skill-right">
                <button
                  className="button"
                  style={{ border: '1px solid #cbd5e1' }}
                  onClick={() => handleOpenInjectDialog(project)}
                >
                  管理工作区
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 1. Add Project Dialog */}
      {addDialogOpen && (
        <div className="modal-overlay" onClick={() => setAddDialogOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleAddProject}>
              <div className="modal-header">
                <span>添加项目工作区</span>
                <button
                  type="button"
                  className="button"
                  style={{ padding: '4px 8px' }}
                  onClick={() => setAddDialogOpen(false)}
                  disabled={isAdding}
                >
                  &times;
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="projName">项目名称</label>
                  <input
                    id="projName"
                    type="text"
                    className="form-input"
                    placeholder="请输入易于识别的项目名称"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    disabled={isAdding}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="projPath">本地绝对路径</label>
                  <DirectoryPicker
                    id="projPath"
                    value={projectPath}
                    onChange={setProjectPath}
                    placeholder="例如：D:\Projects\my-app"
                    disabled={isAdding}
                    hint="支持手动输入，或点击右侧 “选择目录…” 按钮（仅 Chromium 系列浏览器可返回绝对路径）。"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="button"
                  onClick={() => setAddDialogOpen(false)}
                  disabled={isAdding}
                >
                  取消
                </button>
                <button type="submit" className="button button-primary" disabled={isAdding}>
                  {isAdding ? '正在添加...' : '保存项目'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Project Details Modal (Skill Inject & Rule Sync) */}
      {injectDialogOpen && selectedProject && (
        <div className="modal-overlay" onClick={() => setInjectDialogOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>项目工作区管理 - {selectedProject.name}</span>
              <button
                type="button"
                className="button"
                style={{ padding: '4px 8px' }}
                onClick={() => setInjectDialogOpen(false)}
                disabled={isSubmittingPlan || isSyncingRule}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b' }}>
                <div><strong>项目路径:</strong> {selectedProject.path}</div>
              </div>

              {/* Tabs */}
              <div className="tabs" style={{ marginBottom: '16px' }}>
                <button
                  className={`tab-btn ${activeDialogTab === 'skills' ? 'active' : ''}`}
                  onClick={() => setActiveDialogTab('skills')}
                  disabled={isSubmittingPlan || isSyncingRule}
                >
                  技能注入
                </button>
                <button
                  className={`tab-btn ${activeDialogTab === 'rules' ? 'active' : ''}`}
                  onClick={() => setActiveDialogTab('rules')}
                  disabled={isSubmittingPlan || isSyncingRule}
                >
                  AI 规则同步 (D8)
                </button>
              </div>

              {/* TAB 1: SKILLS INJECT */}
              {activeDialogTab === 'skills' && (
                <div>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>选择要注入的 Skill</label>
                      <select
                        className="form-input"
                        value={selectedSkillName}
                        onChange={(e) => {
                          setSelectedSkillName(e.target.value)
                          setInjectPlanResult(null)
                        }}
                        disabled={isSubmittingPlan}
                      >
                        <option value="">-- 请选择 --</option>
                        {skills.map((s: any) => (
                          <option key={s.name} value={s.name}>
                            {s.name} (v{s.version})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
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
                        {selectedProject.enabledAgents.map((a: string) => (
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
                      className="empty-state"
                      style={{
                        color: '#da3633',
                        background: '#ffebe9',
                        border: '1px solid #ffc8c4',
                        padding: '12px',
                        margin: '16px 0',
                        fontSize: '13px'
                      }}
                    >
                      {planErrorMessage}
                    </div>
                  )}

                  {injectPlanResult && (
                    <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1e293b' }}>同步计划预览</h4>
                      
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <span className="badge badge-missing" style={{ background: '#e1f5fe', color: '#0288d1' }}>
                          新增: {injectPlanResult.summary.create}
                        </span>
                        <span className="badge badge-changed">
                          修改: {injectPlanResult.summary.modify}
                        </span>
                        <span className="badge badge-identical">
                          跳过: {injectPlanResult.summary.skip}
                        </span>
                        <span className="badge badge-conflict">
                          冲突: {injectPlanResult.summary.conflict}
                        </span>
                      </div>

                      {injectPlanResult.summary.conflict > 0 && (
                        <div
                          className="form-group"
                          style={{
                            background: '#fffbeb',
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid #fef3c7',
                            marginBottom: '16px'
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={allowManagedModify}
                              onChange={(e) => setAllowManagedModify(e.target.checked)}
                              disabled={isSubmittingPlan}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#b45309' }}>
                              允许覆写冲突文件 (--allow-managed-modify)
                            </span>
                          </label>
                        </div>
                      )}

                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>变更细节:</div>
                      <div style={{ border: '1px solid #e6ebf1', borderRadius: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                        {injectPlanResult.plan.items.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderBottom: idx < injectPlanResult.plan.items.length - 1 ? '1px solid #e6ebf1' : 'none',
                              fontSize: '12px'
                            }}
                          >
                            <div style={{ color: '#475569', wordBreak: 'break-all', paddingRight: '12px' }}>
                              {item.target}
                            </div>
                            <span className={`badge badge-${item.kind === 'skip' ? 'identical' : item.kind === 'modify' ? 'changed' : item.kind}`}>
                              {item.kind === 'create' ? '新增' : item.kind === 'modify' ? '修改' : item.kind === 'skip' ? '跳过' : '冲突'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RULES SYNC */}
              {activeDialogTab === 'rules' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', marginBottom: '20px' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label>选择 Agent 规则</label>
                      <select
                        className="form-input"
                        value={selectedRuleAgent}
                        onChange={(e) => handleRuleAgentChange(e.target.value)}
                        disabled={isFetchingRuleDiff || isSyncingRule}
                      >
                        {selectedProject.enabledAgents.map((a: string) => (
                          <option key={a} value={a}>
                            {a.toUpperCase()} ({a === 'claude' ? 'CLAUDE.md' : a === 'codex' ? 'AGENTS.md' : 'GEMINI.md'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="button"
                        style={{ border: '1px solid #cbd5e1' }}
                        onClick={handlePullRules}
                        disabled={isFetchingRuleDiff || isSyncingRule || !ruleDiff?.exists}
                      >
                        拉取规则 ↓
                      </button>
                      <button
                        className="button button-primary"
                        onClick={handlePushRules}
                        disabled={
                          isFetchingRuleDiff ||
                          isSyncingRule ||
                          !ruleDiff ||
                          ruleDiff.status === 'identical' ||
                          (ruleDiff.status === 'conflict' && !ruleOverwrite)
                        }
                      >
                        {isSyncingRule ? '正在同步...' : '推送规则模板 ↑'}
                      </button>
                    </div>
                  </div>

                  {isFetchingRuleDiff ? (
                    <div className="empty-state">正在计算规则文件差异...</div>
                  ) : ruleDiff ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', color: '#475569' }}>
                          规则同步状态: 
                          <span 
                            className={`badge ${getRuleStatusLabelAndStyle(ruleDiff.status).className}`}
                            style={{ marginLeft: '8px' }}
                          >
                            {getRuleStatusLabelAndStyle(ruleDiff.status).label}
                          </span>
                        </div>
                      </div>

                      {ruleDiff.status === 'conflict' && (
                        <div
                          className="form-group"
                          style={{
                            background: '#fffbeb',
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid #fef3c7',
                            marginBottom: '16px'
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={ruleOverwrite}
                              onChange={(e) => setRuleOverwrite(e.target.checked)}
                              disabled={isSyncingRule}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#b45309' }}>
                              无托管块标识，允许完全覆写 (Overwrite) 项目规则文件
                            </span>
                          </label>
                        </div>
                      )}

                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>差异 Patch 预览:</div>
                      <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <DiffView diff={ruleDiff.patch || ''} />
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">暂无规则同步信息。</div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="button"
                onClick={() => setInjectDialogOpen(false)}
                disabled={isSubmittingPlan || isSyncingRule}
              >
                取消
              </button>
              {activeDialogTab === 'skills' && injectPlanResult && (
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
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
