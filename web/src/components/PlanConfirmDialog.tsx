import { useState } from 'react'

export interface PlanItem {
  kind: 'create' | 'modify' | 'skip' | 'conflict'
  target: string
  targetKey: string
  targetDir?: string
}

export interface PlanResult {
  plan: {
    planId: string
    source: string
    items: PlanItem[]
  }
  summary: {
    create: number
    modify: number
    skip: number
    conflict: number
  }
}

export interface PlanConfirmDialogProps {
  open: boolean
  planResult: PlanResult | null
  allowManagedModify: boolean
  onAllowManagedModifyChange: (val: boolean) => void
  allowConflictOverwrite: boolean
  onAllowConflictOverwriteChange: (val: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  isSubmitting: boolean
  errorMessage: string | null
}

export function PlanConfirmDialog({
  open,
  planResult,
  allowManagedModify,
  onAllowManagedModifyChange,
  allowConflictOverwrite,
  onAllowConflictOverwriteChange,
  onConfirm,
  onCancel,
  isSubmitting,
  errorMessage,
}: PlanConfirmDialogProps) {
  if (!open || !planResult) return null

  const { plan, summary } = planResult
  const hasConflicts = summary.conflict > 0
  const applicableCount = summary.create + summary.modify
  const canApply = applicableCount > 0
  const hasLocalTarget = plan.items.some((item) => item.targetKey === 'local')

  const kindLabels: Record<string, string> = {
    create: '新增',
    modify: '修改',
    skip: '跳过',
    conflict: '冲突',
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>同步计划确认</span>
          <button className="button" style={{ padding: '4px 8px' }} onClick={onCancel} disabled={isSubmitting}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#57606a' }}>
            <div>
              <strong>计划 ID:</strong> {plan.planId}
            </div>
            <div>
              <strong>源端:</strong> {plan.source}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <span className="badge badge-missing" style={{ background: '#e1f5fe', color: '#0288d1' }}>
              新增: {summary.create}
            </span>
            <span className="badge badge-changed">修改: {summary.modify}</span>
            <span className="badge badge-identical">跳过: {summary.skip}</span>
            <span className="badge badge-conflict">冲突: {summary.conflict}</span>
          </div>

          <div
            className="form-group"
            style={{
              background: '#f8fafc',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={allowConflictOverwrite}
                onChange={(e) => onAllowConflictOverwriteChange(e.target.checked)}
                disabled={isSubmitting}
              />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                允许覆盖目标目录中的同名 Skill（包含非托管冲突，覆盖前会备份）
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={allowManagedModify}
                onChange={(e) => onAllowManagedModifyChange(e.target.checked)}
                disabled={isSubmitting}
              />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                允许覆写已被管理器托管但已发生变更的目标 (--allow-managed-modify)
              </span>
            </label>
          </div>

          {hasConflicts && (
            <div
              className="empty-state"
              style={{
                color: '#da3633',
                background: '#ffebe9',
                border: '1px solid #ffc8c4',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              <strong>警告:</strong> 存在未解决的冲突。勾选“允许覆盖目标目录中的同名
              Skill”并重新生成计划后，冲突目标会转为“修改”，执行时先备份再覆盖。
            </div>
          )}

          {hasLocalTarget && (
            <div
              className="empty-state"
              style={{
                color: '#7c4a03',
                background: '#fff8c5',
                border: '1px solid #f0d98c',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              <strong>提示:</strong> 反向拉取会先覆盖本地库，再覆盖该 Skill
              的导入目录（registry.localPath），覆盖前会分别创建备份。
            </div>
          )}

          {!canApply && (
            <div
              className="empty-state"
              style={{
                color: '#57606a',
                background: '#f8fafc',
                border: '1px solid #d0d7de',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              当前计划没有可应用项。请先处理冲突，或重新生成一个包含“新增/修改”的同步计划。
            </div>
          )}

          {errorMessage && (
            <div
              className="empty-state"
              style={{
                color: '#da3633',
                background: '#ffebe9',
                border: '1px solid #ffc8c4',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              {errorMessage}
            </div>
          )}

          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>变更详情:</div>
          <div style={{ border: '1px solid #e6ebf1', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {plan.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: idx < plan.items.length - 1 ? '1px solid #e6ebf1' : 'none',
                  fontSize: '13px',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: '#354557' }}>{item.targetKey || '本地库'}</span>
                  <div style={{ color: '#57606a', fontSize: '11px', wordBreak: 'break-all' }}>{item.target}</div>
                </div>
                <span
                  className={`badge badge-${item.kind === 'skip' ? 'identical' : item.kind === 'modify' ? 'changed' : item.kind}`}
                >
                  {kindLabels[item.kind] || item.kind}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="button" onClick={onCancel} disabled={isSubmitting}>
            取消
          </button>
          <button className="button button-primary" onClick={onConfirm} disabled={isSubmitting || !canApply}>
            {isSubmitting ? '正在应用...' : canApply ? '应用同步' : '无可应用项'}
          </button>
        </div>
      </div>
    </div>
  )
}
