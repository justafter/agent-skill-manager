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
  onConfirm,
  onCancel,
  isSubmitting,
  errorMessage
}: PlanConfirmDialogProps) {
  if (!open || !planResult) return null

  const { plan, summary } = planResult
  const hasConflicts = summary.conflict > 0

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Sync Plan Confirmation</span>
          <button className="button" style={{ padding: '4px 8px' }} onClick={onCancel} disabled={isSubmitting}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#57606a' }}>
            <div><strong>Plan ID:</strong> {plan.planId}</div>
            <div><strong>Source:</strong> {plan.source}</div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <span className="badge badge-missing" style={{ background: '#e1f5fe', color: '#0288d1' }}>
              Create: {summary.create}
            </span>
            <span className="badge badge-changed">
              Modify: {summary.modify}
            </span>
            <span className="badge badge-identical">
              Skip: {summary.skip}
            </span>
            <span className="badge badge-conflict">
              Conflict: {summary.conflict}
            </span>
          </div>

          <div className="form-group" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={allowManagedModify}
                onChange={(e) => onAllowManagedModifyChange(e.target.checked)}
                disabled={isSubmitting}
              />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                Allow overwriting managed targets that have changed (--allow-managed-modify)
              </span>
            </label>
          </div>

          {hasConflicts && (
            <div className="empty-state" style={{ color: '#da3633', background: '#ffebe9', border: '1px solid #ffc8c4', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
              <strong>Warning:</strong> Unresolved conflicts exist. You must check the checkbox above to authorize overwriting these changed directories, or they will be skipped during apply.
            </div>
          )}

          {errorMessage && (
            <div className="empty-state" style={{ color: '#da3633', background: '#ffebe9', border: '1px solid #ffc8c4', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
              {errorMessage}
            </div>
          )}

          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Detailed Changes:</div>
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
                  fontSize: '13px'
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: '#354557' }}>{item.targetKey || 'local'}</span>
                  <div style={{ color: '#57606a', fontSize: '11px', wordBreak: 'break-all' }}>{item.target}</div>
                </div>
                <span className={`badge badge-${item.kind === 'skip' ? 'identical' : item.kind === 'modify' ? 'changed' : item.kind}`}>
                  {item.kind}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="button button-primary"
            onClick={onConfirm}
            disabled={isSubmitting || (summary.create === 0 && summary.modify === 0)}
          >
            {isSubmitting ? 'Applying...' : 'Apply Sync'}
          </button>
        </div>
      </div>
    </div>
  )
}
