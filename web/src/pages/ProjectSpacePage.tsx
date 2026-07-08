import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { apiPost, apiGet, apiDelete } from '../api/client'
import { DirectoryPicker } from '../components/DirectoryPicker'

interface RemovePreviewSkillInstall {
  skill: string
  agent: string
  absolutePath: string
  exists: boolean
}
interface RemovePreviewRuleFile {
  agent: string
  file: string
  absolutePath: string
  exists: boolean
}
interface RemovePreview {
  project: { id: string; name: string; path: string }
  skillInstalls: RemovePreviewSkillInstall[]
  ruleFiles: RemovePreviewRuleFile[]
}

export function ProjectSpacePage() {
  const { data: projectsData, refetch, isLoading } = useApi<any>('projects', '/api/projects')
  const navigate = useNavigate()

  // Per-project "show installed paths" expansion state
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})

  // Per-project "show workspace help" expansion state
  const [workspaceHelpOpen, setWorkspaceHelpOpen] = useState<Record<string, boolean>>({})

  // Add Project Dialog State
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // Remove Project State
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<any | null>(null)
  const [removePreview, setRemovePreview] = useState<RemovePreview | null>(null)
  const [isLoadingRemovePreview, setIsLoadingRemovePreview] = useState(false)
  const [removeConfirmed, setRemoveConfirmed] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectName.trim() || !projectPath.trim()) return

    try {
      setIsAdding(true)
      await apiPost('/api/projects', {
        name: projectName.trim(),
        path: projectPath.trim(),
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

  const handleOpenWorkspace = (projectId: string) => {
    navigate(`/projects/${projectId}`)
  }

  const handleOpenRemoveDialog = async (project: any) => {
    setRemoveTarget(project)
    setRemoveDialogOpen(true)
    setRemovePreview(null)
    setRemoveConfirmed(false)
    setRemoveError(null)
    setIsLoadingRemovePreview(true)
    try {
      const preview = await apiGet<RemovePreview>(`/api/projects/${project.id}/remove-preview`)
      setRemovePreview(preview)
    } catch (err) {
      setRemoveError((err as Error).message)
    } finally {
      setIsLoadingRemovePreview(false)
    }
  }

  const handleCloseRemoveDialog = () => {
    if (isRemoving) return
    setRemoveDialogOpen(false)
    setRemoveTarget(null)
    setRemovePreview(null)
    setRemoveConfirmed(false)
    setRemoveError(null)
  }

  const handleConfirmRemove = async () => {
    if (!removeTarget || !removeConfirmed) return
    try {
      setIsRemoving(true)
      setRemoveError(null)
      const res = await apiDelete<{ success: boolean; projects: any[]; backupPath: string }>(
        `/api/projects/${removeTarget.id}`,
        { confirmed: true },
      )
      alert(`[成功] 已解除注册 "${removeTarget.name}"。\n配置备份已保存至: ${res.backupPath}`)
      setRemoveDialogOpen(false)
      setRemoveTarget(null)
      setRemovePreview(null)
      setRemoveConfirmed(false)
      await refetch()
    } catch (err) {
      setRemoveError((err as Error).message)
    } finally {
      setIsRemoving(false)
    }
  }

  if (isLoading || !projectsData) {
    return (
      <div className="page">
        <div className="empty-state">正在加载项目列表...</div>
      </div>
    )
  }

  const projects = projectsData.projects || []

  const getAgentTagStyle = (agent: string) => {
    if (agent === 'claude') return { background: '#fdf0ec', color: '#c05621' }
    if (agent === 'codex') return { background: '#ebfbee', color: '#2f855a' }
    if (agent === 'gemini') return { background: '#ebf8ff', color: '#2b6cb0' }
    return { background: '#faf5ff', color: '#6b46c1' }
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
                  <span>
                    检测到 Skill 目录: <strong>{project.scan?.skillDirs?.length || 0}</strong> 个
                  </span>
                  <span>
                    检测到 Rule 文件: <strong>{project.scan?.ruleFiles?.length || 0}</strong> 个
                  </span>
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
                        textDecoration: 'underline',
                      }}
                      onClick={() =>
                        setExpandedProjects((prev) => ({
                          ...prev,
                          [project.id]: !prev[project.id],
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
                      fontSize: '12px',
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
                              paddingLeft: '12px',
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
                              paddingLeft: '12px',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="button"
                    style={{ border: '1px solid #cbd5e1' }}
                    onClick={() => handleOpenWorkspace(project.id)}
                  >
                    管理工作区
                  </button>
                  <button
                    type="button"
                    aria-label="工作区说明"
                    title="点击查看本页可做什么"
                    style={{
                      background: 'transparent',
                      border: '1px solid #cbd5e1',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      padding: 0,
                      cursor: 'help',
                      color: '#2563eb',
                      fontSize: 14,
                      lineHeight: '22px',
                    }}
                    onClick={() =>
                      setWorkspaceHelpOpen((prev) => ({
                        ...prev,
                        [project.id]: !prev[project.id],
                      }))
                    }
                  >
                    &#9432;
                  </button>
                </div>
                <button
                  className="button"
                  style={{
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    background: '#fef2f2',
                    marginLeft: '8px',
                  }}
                  onClick={() => handleOpenRemoveDialog(project)}
                >
                  移除项目
                </button>
              </div>
              {workspaceHelpOpen[project.id] && (
                <div
                  style={{
                    flexBasis: '100%',
                    marginTop: 8,
                    padding: '10px 12px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#1e3a8a',
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>工作区页能做什么？</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>查看本项目下已检测到的 Skill 目录与 Rule 文件的绝对路径；</li>
                    <li>选择本地库中的 Skill，按 Agent 类型（CLAUDE / CODEX / GEMINI）注入到项目级目录；</li>
                    <li>同步 CLAUDE.md / AGENTS.md / GEMINI.md 与本地模板的差异；</li>
                    <li>重新扫描项目目录以刷新检测结果。</li>
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Project Dialog */}
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
                <button type="button" className="button" onClick={() => setAddDialogOpen(false)} disabled={isAdding}>
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

      {/* Remove Project Dialog */}
      {removeDialogOpen && removeTarget && (
        <div className="modal-overlay" onClick={handleCloseRemoveDialog}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <span>移除项目 {removeTarget.name}</span>
              <button
                type="button"
                className="button"
                style={{ padding: '4px 8px' }}
                onClick={handleCloseRemoveDialog}
                disabled={isRemoving}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                以下文件不会被删除，移除后仅不再受本工具管理。
              </div>

              {isLoadingRemovePreview ? (
                <div className="empty-state">正在加载影响预览...</div>
              ) : removePreview ? (
                <div style={{ fontSize: '13px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>待移除注册记录：</strong>
                    <div style={{ fontFamily: 'monospace', paddingLeft: '12px', marginTop: '4px' }}>
                      ID: {removePreview.project.id}
                      <br />
                      Name: {removePreview.project.name}
                      <br />
                      Path: {removePreview.project.path}
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <strong>项目级 Skill 安装：</strong>
                    {removePreview.skillInstalls.length === 0 ? (
                      <div style={{ paddingLeft: '12px', color: '#64748b' }}>(无)</div>
                    ) : (
                      <ul style={{ paddingLeft: '24px', margin: '4px 0' }}>
                        {removePreview.skillInstalls.map((s, i) => (
                          <li key={`s-${i}`} style={{ fontFamily: 'monospace', marginBottom: '2px' }}>
                            [{s.agent}] {s.skill} — {s.absolutePath}{' '}
                            <span style={{ color: s.exists ? '#15803d' : '#94a3b8' }}>
                              ({s.exists ? '存在' : '缺失'})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <strong>项目级规则文件：</strong>
                    {removePreview.ruleFiles.length === 0 ? (
                      <div style={{ paddingLeft: '12px', color: '#64748b' }}>(无)</div>
                    ) : (
                      <ul style={{ paddingLeft: '24px', margin: '4px 0' }}>
                        {removePreview.ruleFiles.map((r, i) => (
                          <li key={`r-${i}`} style={{ fontFamily: 'monospace', marginBottom: '2px' }}>
                            [{r.agent}] {r.file} — {r.absolutePath}{' '}
                            <span style={{ color: r.exists ? '#15803d' : '#94a3b8' }}>
                              ({r.exists ? '存在' : '缺失'})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '12px' }}>
                    移除前将自动备份当前 config.json 到 <code>backups/config-snapshots/</code>。
                  </div>
                </div>
              ) : (
                <div className="empty-state">无法加载预览。</div>
              )}

              {removeError && (
                <div
                  style={{
                    background: '#ffebe9',
                    border: '1px solid #ffc8c4',
                    color: '#b91c1c',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    marginTop: '12px',
                  }}
                >
                  {removeError}
                </div>
              )}

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  marginTop: '16px',
                  padding: '10px 12px',
                  background: '#fffbeb',
                  border: '1px solid #fef3c7',
                  borderRadius: '6px',
                }}
              >
                <input
                  type="checkbox"
                  checked={removeConfirmed}
                  onChange={(e) => setRemoveConfirmed(e.target.checked)}
                  disabled={isRemoving || isLoadingRemovePreview || !removePreview}
                />
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#92400e' }}>我已了解上述文件不会被删除</span>
              </label>
            </div>

            <div className="modal-footer">
              <button className="button" onClick={handleCloseRemoveDialog} disabled={isRemoving}>
                取消
              </button>
              <button
                className="button button-primary"
                onClick={handleConfirmRemove}
                disabled={isRemoving || !removeConfirmed || isLoadingRemovePreview || !removePreview}
                style={{
                  background: removeConfirmed && !isRemoving ? '#dc2626' : undefined,
                  borderColor: removeConfirmed && !isRemoving ? '#dc2626' : undefined,
                }}
              >
                {isRemoving ? '正在移除...' : '确认移除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
