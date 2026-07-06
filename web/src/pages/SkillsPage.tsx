import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { SkillCard } from '../components/SkillCard'
import { PlanConfirmDialog, PlanResult } from '../components/PlanConfirmDialog'
import { apiPost } from '../api/client'

export function SkillsPage() {
  const { data: config } = useApi<any>('config', '/api/config')
  const { data: skillsData, refetch, isLoading } = useApi<any>('skills', '/api/skills')

  const [activeTab, setActiveTab] = useState<string>('all')
  const [isScanning, setIsScanning] = useState(false)

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
      await apiPost('/api/scan')
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
        <button
          className="button button-primary"
          type="button"
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? '正在扫描...' : '扫描目标目录'}
        </button>
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
              targets={skill.targets || {}}
              syncedTargets={skill.syncedTargets || []}
              projectInstalls={skill.projectInstalls || []}
              enabledTargets={enabledTargets}
              onPlanSync={(to, from) => triggerPlan(skill.name, to, from, allowManagedModify)}
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
