import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { SkillCard } from '../components/SkillCard'
import { PlanConfirmDialog, PlanResult } from '../components/PlanConfirmDialog'
import { DirectoryPicker } from '../components/DirectoryPicker'
import { apiPost } from '../api/client'

export function SkillsPage() {
  const { data: config } = useApi<any>('config', '/api/config')
  const { data: skillsData, refetch, isLoading } = useApi<any>('skills', '/api/skills')
  const { data: watchData, refetch: refetchWatches } = useApi<any>('watches', '/api/watch/status')

  const [activeTab, setActiveTab] = useState<string>('all')
  const [isScanning, setIsScanning] = useState(false)
  const [developmentBySkill, setDevelopmentBySkill] = useState<Record<string, any>>({})
  const [refreshingSkillName, setRefreshingSkillName] = useState<string | null>(null)

  const handleToggleWatch = async (skillName: string, enabled: boolean) => {
    try {
      if (enabled) {
        await apiPost('/api/watch/start', { skillName })
      } else {
        await apiPost('/api/watch/stop', { skillName })
      }
      await refetchWatches()
    } catch (err) {
      alert(`切换监听模式失败: ${(err as Error).message}`)
    }
  }

  const watches = watchData?.watches || []
  const getWatchState = (skillName: string) => {
    return watches.find((w: any) => w.skillName === skillName) || null
  }

  // Import-by-path dialog state (replaces the standalone /import page)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importForce, setImportForce] = useState(false)
  const [importSkip, setImportSkip] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importFeedback, setImportFeedback] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null)

  // Sync state
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [planResult, setPlanResult] = useState<PlanResult | null>(null)
  const [currentSkill, setCurrentSkill] = useState<string | null>(null)
  const [currentToTarget, setCurrentToTarget] = useState<string | undefined>(undefined)
  const [currentFromTarget, setCurrentFromTarget] = useState<string | undefined>(undefined)
  const [allowManagedModify, setAllowManagedModify] = useState(false)
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false)
  const [planErrorMessage, setPlanErrorMessage] = useState<string | null>(null)

  const handleScan = async () => {
    try {
      setIsScanning(true)
      const scanResult = await apiPost<any>('/api/scan')
      setDevelopmentBySkill(scanResult.development || {})
      await refetch()
    } catch (err) {
      alert(`扫描失败: ${(err as Error).message}`)
    } finally {
      setIsScanning(false)
    }
  }

  const triggerPlan = async (skillName: string, toTarget?: string, fromTarget?: string, currentModifyVal = false) => {
    try {
      setIsSubmittingPlan(true)
      setPlanErrorMessage(null)
      setCurrentSkill(skillName)
      setCurrentToTarget(toTarget)
      setCurrentFromTarget(fromTarget)

      // toTarget === 'local' 表示反向拉取（pull），需要传 from；
      // 否则按 D3a push 语义处理。
      const isPull = toTarget === 'local' && !!fromTarget
      const body = {
        skillName,
        targets: !isPull && toTarget ? [toTarget] : undefined,
        from: isPull ? fromTarget : undefined,
        allowManagedModify: currentModifyVal
      }

      const res = await apiPost<PlanResult>('/api/sync/plan', body)
      setPlanResult(res)
      setPlanDialogOpen(true)
    } catch (err) {
      alert(`创建同步计划失败: ${(err as Error).message}`)
    } finally {
      setIsSubmittingPlan(false)
    }
  }

  const handleAllowManagedModifyChange = async (val: boolean) => {
    setAllowManagedModify(val)
    if (currentSkill) {
      await triggerPlan(currentSkill, currentToTarget, currentFromTarget, val)
    }
  }

  const handleConfirmSync = async () => {
    if (!planResult) return
    try {
      setIsSubmittingPlan(true)
      setPlanErrorMessage(null)
      await apiPost('/api/sync/apply', {
        planId: planResult.plan.planId,
        allowManagedModify
      })
      setPlanDialogOpen(false)
      setPlanResult(null)
      await refetch()
    } catch (err) {
      setPlanErrorMessage((err as Error).message)
    } finally {
      setIsSubmittingPlan(false)
    }
  }

  const handleImportUntracked = async (path: string) => {
    try {
      setIsScanning(true)
      const res = await apiPost<any>('/api/import', {
        path,
        force: false,
        skip: true
      })
      alert(`[成功] 已成功导入并托管技能: ${res.skill.name}`)
      await refetch()
    } catch (err) {
      alert(`导入失败: ${(err as Error).message}`)
    } finally {
      setIsScanning(false)
    }
  }

  const handleRefreshFromLocal = async (skill: any) => {
    if (!skill.localPath) return
    const confirmed = window.confirm(
      `确定要用导入目录中的最新内容更新本地库吗？\n\n${skill.localPath}`
    )
    if (!confirmed) return

    try {
      setRefreshingSkillName(skill.name)
      await apiPost('/api/import', {
        path: skill.localPath,
        force: true,
        skip: false
      })
      const scanResult = await apiPost<any>('/api/scan')
      setDevelopmentBySkill(scanResult.development || {})
      await refetch()
    } catch (err) {
      alert(`更新本地库失败: ${(err as Error).message}`)
    } finally {
      setRefreshingSkillName(null)
    }
  }

  const handleImportByPath = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importPath.trim()) return
    try {
      setIsImporting(true)
      setImportFeedback(null)
      const res = await apiPost<any>('/api/import', {
        path: importPath.trim(),
        force: importForce,
        skip: importSkip
      })
      setImportFeedback(
        res.skipped
          ? {
              type: 'success',
              message: `[跳过] 由于已存在相同校验和的 Skill，跳过导入 "${res.skill.name}"。`
            }
          : {
              type: 'success',
              message: `[成功] Skill "${res.skill.name}" (v${res.skill.version}) 已成功导入到本地库！`
            }
      )
      setImportPath('')
      setImportForce(false)
      setImportSkip(false)
      await refetch()
    } catch (err) {
      setImportFeedback({
        type: 'error',
        message: `导入失败: ${(err as Error).message}`
      })
    } finally {
      setIsImporting(false)
    }
  }

  const closeImportDialog = () => {
    setImportDialogOpen(false)
    setImportFeedback(null)
    setImportPath('')
    setImportForce(false)
    setImportSkip(false)
  }

  if (isLoading || !config || !skillsData) {
    return <div className="page"><div className="empty-state">正在加载 Skill...</div></div>
  }

  const enabledTargets = Object.entries(config.targets)
    .filter(([_, t]: any) => t.enabled && _ !== 'gemini')
    .map(([key]) => `${key}:user`)

  const skills = skillsData.skills || []

  const getAgentCount = (targetKey: string) => {
    return skills.filter((s: any) => s.targets && s.targets[targetKey] && s.targets[targetKey] !== 'missing').length
  }

  // Filter skills
  const filteredSkills = skills.filter((s: any) => {
    if (activeTab === 'all') {
      return true
    }
    if (activeTab.includes(':user')) {
      return s.targets && s.targets[activeTab] && s.targets[activeTab] !== 'missing'
    }
    return true
  })

  return (
    <section className="page">
      <div className="toolbar">
        <h2>Skill 库</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="button"
            type="button"
            onClick={() => setImportDialogOpen(true)}
          >
            导入技能
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning ? '正在检查...' : '检查更新'}
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <button 
          className={`filter-pill ${activeTab === 'all' ? 'active' : ''}`} 
          onClick={() => setActiveTab('all')}
        >
          已安装
        </button>
        <button 
          className={`filter-pill filter-claude ${activeTab === 'claude:user' ? 'active' : ''}`} 
          onClick={() => setActiveTab('claude:user')}
        >
          Claude: <strong>{getAgentCount('claude:user')}</strong>
        </button>
        <button 
          className={`filter-pill filter-codex ${activeTab === 'codex:user' ? 'active' : ''}`} 
          onClick={() => setActiveTab('codex:user')}
        >
          Codex: <strong>{getAgentCount('codex:user')}</strong>
        </button>
        <button 
          className={`filter-pill filter-gemini ${activeTab === 'gemini:user' ? 'active' : ''}`} 
          onClick={() => setActiveTab('gemini:user')}
        >
          Gemini: <strong>{getAgentCount('gemini:user')}</strong>
        </button>
      </div>

      {filteredSkills.length === 0 ? (
        <div className="empty-state">没有与当前筛选条件匹配的 Skill。</div>
      ) : (
        <div className="skill-list">
          {filteredSkills.map((skill: any) => (
            <SkillCard
              key={skill.name}
              name={skill.name}
              description={skill.description}
              version={skill.version}
              checksum={skill.checksum}
              localPath={skill.localPath}
              development={developmentBySkill[skill.name]}
              targets={skill.targets || {}}
              syncedTargets={skill.syncedTargets || []}
              projectInstalls={skill.projectInstalls || []}
              installedPaths={skill.installedPaths || {}}
              enabledTargets={enabledTargets}
              onPlanSync={(to, from) => triggerPlan(skill.name, to, from, allowManagedModify)}
              onRefreshFromLocal={() => handleRefreshFromLocal(skill)}
              isRefreshingFromLocal={refreshingSkillName === skill.name}
              watchState={getWatchState(skill.name)}
              onToggleWatch={(enabled: boolean) => handleToggleWatch(skill.name, enabled)}
            />
          ))}
        </div>
      )}

      {(() => {
        const untracked = skillsData.untracked || {}
        const hasUntracked = Object.values(untracked).some((arr: any) => arr.length > 0)
        if (!hasUntracked) return null

        return (
          <div style={{ marginTop: '32px' }}>
            <h3 style={{ fontSize: '16px', color: '#17202a', marginBottom: '8px' }}>检测到未托管的技能 (Untracked)</h3>
            <p style={{ color: '#57606a', fontSize: '13px', marginBottom: '16px' }}>
              以下技能存在于目标 Agent 的用户目录下，但尚未登记到本地管理器中。您可以一键导入进行统一管理。
            </p>
            
            <div className="skill-list">
              {Object.entries(untracked).flatMap(([targetKey, list]: any) => 
                list.map((item: any) => {
                  const agentName = targetKey.split(':')[0]
                  return (
                    <div key={`${targetKey}-${item.name}`} className="skill-row">
                      <div className="skill-left">
                        <div className="skill-name-row">
                          <h4 className="skill-title">{item.name}</h4>
                          <span className="skill-tag" style={{ background: '#e1f5fe', color: '#0288d1' }}>未托管</span>
                          <span 
                            className="skill-tag" 
                            style={
                              agentName === 'claude' 
                                ? { background: '#fdf0ec', color: '#c05621' } 
                                : agentName === 'codex' 
                                ? { background: '#ebfbee', color: '#2f855a' } 
                                : agentName === 'gemini' 
                                ? { background: '#ebf8ff', color: '#2b6cb0' } 
                                : { background: '#faf5ff', color: '#6b46c1' }
                            }
                          >
                            来自 {agentName}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', fontFamily: 'monospace', color: '#718096', margin: '4px 0 0 0' }}>
                          路径: {item.path}
                        </p>
                      </div>
                      <div className="skill-right">
                        <button
                          className="button button-primary"
                          style={{ padding: '6px 14px', fontSize: '13px' }}
                          onClick={() => handleImportUntracked(item.path)}
                          disabled={isScanning}
                        >
                          一键导入
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })()}

      {importDialogOpen && (
        <div className="modal-overlay" onClick={closeImportDialog}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '560px', width: '90%' }}
          >
            <form onSubmit={handleImportByPath}>
              <div className="modal-header">
                <span>导入 Skill 到本地库</span>
                <button
                  type="button"
                  className="button"
                  style={{ padding: '4px 8px' }}
                  onClick={closeImportDialog}
                  disabled={isImporting}
                >
                  &times;
                </button>
              </div>

              <div className="modal-body">
                <p style={{ color: '#57606a', fontSize: '13px', marginBottom: '16px' }}>
                  请输入要导入的 Skill 绝对目录路径。管理器会在写入本地库前校验其
                  <code style={{ background: '#f1f5f9', padding: '0 4px', borderRadius: '3px', margin: '0 4px' }}>SKILL.md</code>
                  的 Frontmatter 元数据。
                </p>

                <div className="form-group">
                  <label htmlFor="import-path">源目录路径（绝对路径）</label>
                  <DirectoryPicker
                    id="import-path"
                    value={importPath}
                    onChange={(v) => {
                      setImportPath(v)
                      setImportFeedback(null)
                    }}
                    placeholder="例如：D:\MySkills\my-new-skill"
                    disabled={isImporting}
                    hint="支持手动输入，或点击右侧 “选择目录…” 按钮（仅 Chromium 系列浏览器可返回绝对路径）。"
                  />
                </div>

                <div
                  className="form-group"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '12px'
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      margin: 0,
                      fontWeight: 500
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={importForce}
                      onChange={(e) => setImportForce(e.target.checked)}
                      disabled={isImporting}
                    />
                    <span>强制覆写（覆盖前会创建注册表与本地备份）</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      margin: 0,
                      fontWeight: 500
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={importSkip}
                      onChange={(e) => setImportSkip(e.target.checked)}
                      disabled={isImporting}
                    />
                    <span>如果校验和一致则跳过</span>
                  </label>
                </div>

                {importFeedback && (
                  <div
                    className="empty-state"
                    style={{
                      marginTop: '16px',
                      padding: '12px',
                      fontSize: '13px',
                      background: importFeedback.type === 'success' ? '#dafbe1' : '#ffebe9',
                      color: importFeedback.type === 'success' ? '#1a7f37' : '#cf222e',
                      border:
                        importFeedback.type === 'success'
                          ? '1px solid #c4f2d2'
                          : '1px solid #ffc8c4'
                    }}
                  >
                    {importFeedback.message}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="button"
                  onClick={closeImportDialog}
                  disabled={isImporting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={isImporting || !importPath.trim()}
                >
                  {isImporting ? '正在导入...' : '导入 Skill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PlanConfirmDialog
        open={planDialogOpen}
        planResult={planResult}
        allowManagedModify={allowManagedModify}
        onAllowManagedModifyChange={handleAllowManagedModifyChange}
        onConfirm={handleConfirmSync}
        onCancel={() => {
          setPlanDialogOpen(false)
          setPlanResult(null)
        }}
        isSubmitting={isSubmittingPlan}
        errorMessage={planErrorMessage}
      />
    </section>
  )
}
