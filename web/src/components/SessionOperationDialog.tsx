export interface SessionPlanItemView {
  sessionId: string
  status: 'ready' | 'conflict' | 'busy' | 'invalid'
  targetPath: string
  sizeBytes: number
  reason?: string
  warnings: string[]
  record: {
    title?: string
  }
}

export interface SessionPlanView {
  plan: {
    planId: string
    action: 'migrate' | 'restore'
    agent: 'claude' | 'codex' | 'gemini'
    items: SessionPlanItemView[]
  }
  summary: {
    ready: number
    conflict: number
    busy: number
    invalid: number
  }
}

interface Props {
  open: boolean
  result: SessionPlanView | null
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function SessionOperationDialog({ open, result, submitting, error, onConfirm, onCancel }: Props) {
  if (!open || !result) return null
  const { plan, summary } = result
  const actionLabel = plan.action === 'migrate' ? '迁移到归档目录' : '还原到 Agent 原目录'

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span>会话{plan.action === 'migrate' ? '迁移' : '还原'}计划确认</span>
          <button className="button" onClick={onCancel} disabled={submitting}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="session-plan-meta">
            <div><strong>计划 ID：</strong>{plan.planId}</div>
            <div><strong>Agent：</strong>{plan.agent}</div>
            <div><strong>操作：</strong>{actionLabel}</div>
          </div>

          <div className="session-plan-summary">
            <span className="badge badge-identical">可执行 {summary.ready}</span>
            <span className="badge badge-conflict">冲突 {summary.conflict}</span>
            <span className="badge badge-changed">占用 {summary.busy}</span>
            <span className="badge badge-missing">无效 {summary.invalid}</span>
          </div>

          <div className="session-safety-note">
            {plan.action === 'migrate'
              ? '归档副本完成 checksum 校验前不会删除 Agent 原文件；提交后删除失败时会保留双份数据并标记待清理。'
              : '还原目标已存在时不会覆盖；归档副本仅在原路径还原并校验成功后删除。'}
          </div>

          {error && <div className="session-error">{error}</div>}

          <div className="session-plan-items">
            {plan.items.map((item) => (
              <div className="session-plan-item" key={item.sessionId}>
                <div>
                  <strong>{item.record.title || item.sessionId}</strong>
                  <div className="session-path">{item.sessionId}</div>
                  <div className="session-path">目标：{item.targetPath}</div>
                  {item.reason && <div className="session-item-reason">{item.reason}</div>}
                  {item.warnings.map((warning) => (
                    <div className="session-item-warning" key={warning}>{warning}</div>
                  ))}
                </div>
                <div className="session-plan-side">
                  <span className={`badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                  <span>{formatBytes(item.sizeBytes)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="button" onClick={onCancel} disabled={submitting}>取消</button>
          <button className="button button-primary" onClick={onConfirm} disabled={submitting || summary.ready === 0}>
            {submitting ? '正在执行…' : `确认${plan.action === 'migrate' ? '迁移' : '还原'} ${summary.ready} 项`}
          </button>
        </div>
      </div>
    </div>
  )
}

function statusLabel(status: SessionPlanItemView['status']): string {
  return { ready: '可执行', conflict: '冲突', busy: '占用', invalid: '无效' }[status]
}

function statusClass(status: SessionPlanItemView['status']): string {
  if (status === 'ready') return 'badge-identical'
  if (status === 'conflict') return 'badge-conflict'
  if (status === 'busy') return 'badge-changed'
  return 'badge-missing'
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let index = 0
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024
    index++
  }
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}
