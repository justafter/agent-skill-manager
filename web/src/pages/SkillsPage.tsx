import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { SkillCard } from '../components/SkillCard'
import { PlanConfirmDialog, PlanResult } from '../components/PlanConfirmDialog'
import { apiPost } from '../api/client'

export function SkillsPage() {
  const { data: config } = useApi<any>('config', '/api/config')
  const { data: skillsData, refetch, isLoading } = useApi<any>('skills', '/api/skills')

  const [activeTab, setActiveTab] = useState<'all' | 'missing' | 'synced' | 'conflict' | 'project'>('all')
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
      alert(`Scan failed: ${(err as Error).message}`)
    } finally {
      setIsScanning(false)
    }
  }

  const handlePlanSync = async (toTarget?: string, fromTarget?: string, forceModify = false) => {
    if (!currentSkill && !forceModify) return

    const skillName = forceModify ? currentSkill! : toTarget ? (fromTarget ? 'local' : toTarget) : 'all'
    const actualSkillName = forceModify ? currentSkill! : (fromTarget ? fromTarget : toTarget ? toTarget : '') // wait

    // Actually, onPlanSync in SkillCard passes:
    // toTarget: targetKey (e.g. claude:user), fromTarget: undefined -> PUSH
    // toTarget: 'local', fromTarget: targetKey (e.g. claude:user) -> PULL
    // toTarget: undefined, fromTarget: undefined -> PUSH ALL TARGETS
    
    // So the skill we want to sync is the one clicked. How do we get the clicked skill name?
    // We can store it or pass it as first parameter!
    // Let's look at SkillCardProps: onPlanSync: (toTarget?: string, fromTarget?: string) => void
    // Let's modify SkillCard to pass name or bind it. In SkillCard: onClick={() => onPlanSync(targetKey)}
    // It doesn't pass skill name. But we can bind the name inside SkillsPage when rendering SkillCard!
    // e.g. onPlanSync={(to, from) => triggerPlan(skill.name, to, from)}
  }

  const triggerPlan = async (skillName: string, toTarget?: string, fromTarget?: string, currentModifyVal = false) => {
    try {
      setIsSubmittingPlan(true)
      setPlanErrorMessage(null)
      setCurrentSkill(skillName)
      setCurrentToTarget(toTarget)
      setCurrentFromTarget(fromTarget)

      const body = {
        skillName,
        targets: toTarget ? [toTarget] : undefined,
        from: fromTarget,
        allowManagedModify: currentModifyVal
      }

      const res = await apiPost<PlanResult>('/api/sync/plan', body)
      setPlanResult(res)
      setPlanDialogOpen(true)
    } catch (err) {
      alert(`Failed to create plan: ${(err as Error).message}`)
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

  if (isLoading || !config || !skillsData) {
    return <div className="page"><div className="empty-state">Loading skills...</div></div>
  }

  const enabledTargets = Object.entries(config.targets)
    .filter(([_, t]: any) => t.enabled && _ !== 'gemini')
    .map(([key]) => `${key}:user`)

  const skills = skillsData.skills || []

  // Filter skills
  const filteredSkills = skills.filter((s: any) => {
    const targetStatuses = Object.values(s.targets || {}) as string[]
    if (activeTab === 'missing') {
      return targetStatuses.includes('missing')
    }
    if (activeTab === 'synced') {
      return enabledTargets.length > 0 && enabledTargets.every(t => s.targets[t] === 'identical')
    }
    if (activeTab === 'conflict') {
      return targetStatuses.includes('conflict') || targetStatuses.includes('changed')
    }
    if (activeTab === 'project') {
      return s.projectInstalls && s.projectInstalls.length > 0
    }
    return true
  })

  return (
    <section className="page">
      <div className="toolbar">
        <h2>Skills Library</h2>
        <button
          className="button button-primary"
          type="button"
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? 'Scanning...' : 'Scan Target Directories'}
        </button>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>全部 ({skills.length})</button>
        <button className={`tab-btn ${activeTab === 'missing' ? 'active' : ''}`} onClick={() => setActiveTab('missing')}>缺失 ({skills.filter((s: any) => Object.values(s.targets || {}).includes('missing')).length})</button>
        <button className={`tab-btn ${activeTab === 'synced' ? 'active' : ''}`} onClick={() => setActiveTab('synced')}>已同步 ({skills.filter((s: any) => enabledTargets.length > 0 && enabledTargets.every(t => s.targets[t] === 'identical')).length})</button>
        <button className={`tab-btn ${activeTab === 'conflict' ? 'active' : ''}`} onClick={() => setActiveTab('conflict')}>冲突 ({skills.filter((s: any) => Object.values(s.targets || {}).some(st => st === 'conflict' || st === 'changed')).length})</button>
        <button className={`tab-btn ${activeTab === 'project' ? 'active' : ''}`} onClick={() => setActiveTab('project')}>项目级 ({skills.filter((s: any) => s.projectInstalls && s.projectInstalls.length > 0).length})</button>
      </div>

      {filteredSkills.length === 0 ? (
        <div className="empty-state">No skills match the selected status filter.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '25%' }}>Name</th>
              <th style={{ width: '40%' }}>Description</th>
              <th style={{ width: '25%' }}>Target Sync Status</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
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
          </tbody>
        </table>
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
