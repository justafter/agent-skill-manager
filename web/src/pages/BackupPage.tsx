import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { apiPost } from '../api/client'

export function BackupPage() {
  const { data, refetch, isLoading } = useApi<any>('backups', '/api/backups')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      await apiPost('/api/backups', {
        reason: reason.trim() || '来自 Web UI 的手动备份',
      })
      setReason('')
      setShowCreateForm(false)
      await refetch()
    } catch (err) {
      alert(`创建备份失败: ${(err as Error).message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRestore = async (backupId: string) => {
    const ok = window.confirm(
      `警告：您确定要恢复备份 [${backupId}] 吗？这将完全覆写您当前的 registry.json 以及本地 Skill 库文件夹，使它们回滚到备份时的状态。此操作无法撤销。`,
    )
    if (!ok) return

    try {
      setIsSubmitting(true)
      const res = await apiPost<any>('/api/restore', { backupId })
      alert(`[成功] 恢复成功！已回滚 ${res.index.items.length} 项。`)
      await refetch()
    } catch (err) {
      alert(`恢复失败: ${(err as Error).message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="empty-state">正在加载备份...</div>
      </div>
    )
  }

  const backups = data?.backups || []

  return (
    <section className="page" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="toolbar" style={{ marginBottom: '24px' }}>
        <h2>备份与恢复归档</h2>
        <button
          className="button button-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
          disabled={isSubmitting}
        >
          {showCreateForm ? '取消' : '创建快照备份'}
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateBackup}
          style={{
            background: '#ffffff',
            border: '1px solid #d8dee9',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="reason" style={{ fontWeight: 600, fontSize: '14px' }}>
              备份原因 / 备注说明
            </label>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
              <input
                id="reason"
                type="text"
                className="form-input"
                placeholder="例如：重构核心 Skill 之前"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="submit"
                className="button button-primary"
                style={{ whiteSpace: 'nowrap' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? '正在保存...' : '保存备份'}
              </button>
            </div>
          </div>
        </form>
      )}

      {backups.length === 0 ? (
        <div className="empty-state">未找到任何备份归档。手动或自动创建的所有备份都将显示在此处。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {backups.map((bk: any) => (
            <div
              key={bk.backupId}
              style={{
                background: '#ffffff',
                border: '1px solid #d8dee9',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '1px solid #eaeef2',
                  paddingBottom: '12px',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <strong style={{ fontSize: '16px', color: '#17202a', fontFamily: 'monospace' }}>{bk.backupId}</strong>
                  <div style={{ fontSize: '12px', color: '#57606a', marginTop: '4px' }}>
                    创建时间: {new Date(bk.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  className="button button-danger"
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                  onClick={() => handleRestore(bk.backupId)}
                  disabled={isSubmitting}
                >
                  恢复此备份
                </button>
              </div>

              <div style={{ fontSize: '14px', color: '#354557', marginBottom: '12px' }}>
                <strong>备份原因:</strong> {bk.reason}
              </div>

              <div style={{ fontSize: '13px' }}>
                <div style={{ fontWeight: 600, color: '#57606a', marginBottom: '6px' }}>
                  已归档项目 ({bk.items.length}):
                </div>
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    border: '1px solid #e6ebf1',
                  }}
                >
                  {bk.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        fontSize: '12px',
                        borderBottom: idx < bk.items.length - 1 ? '1px solid #f1f5f9' : 'none',
                      }}
                    >
                      <span style={{ color: '#0969da', fontWeight: 500 }}>
                        {item.skillName
                          ? `Skill: ${item.skillName}`
                          : item.type === 'registry'
                            ? '注册表快照'
                            : '全局 Skill 库'}
                      </span>
                      <span style={{ color: '#57606a', fontFamily: 'monospace' }}>{item.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
