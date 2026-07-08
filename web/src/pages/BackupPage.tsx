import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { apiPost, apiDelete } from '../api/client'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

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

  const handleDelete = async (bk: any) => {
    const itemCount = bk.items?.length ?? 0
    const ok = window.confirm(
      `警告：您确定要永久删除备份 [${bk.backupId}] 吗？\n\n` +
        `该备份包含 ${itemCount} 个项目，创建于 ${new Date(bk.createdAt).toLocaleString()}。\n` +
        `此操作不可撤销，删除后无法再恢复该备份。`,
    )
    if (!ok) return

    try {
      setIsSubmitting(true)
      const res = await apiDelete<{ success: boolean; backupId: string; removedItems: number; removedBytes: number }>(
        `/api/backups/${encodeURIComponent(bk.backupId)}`,
      )
      alert(
        `[成功] 已删除备份 ${res.backupId}。\n` +
          `释放项目: ${res.removedItems} 个\n` +
          `释放空间: ${formatBytes(res.removedBytes)}`,
      )
      await refetch()
    } catch (err) {
      alert(`删除失败: ${(err as Error).message}`)
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '13px' }}>
            备份目录:{' '}
            <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {data?.backupDir || '(未配置)'}
            </code>
          </span>
          <button
            className="button button-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
            disabled={isSubmitting}
          >
            {showCreateForm ? '取消' : '创建快照备份'}
          </button>
        </div>
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="button"
                    style={{
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      background: '#fef2f2',
                      padding: '6px 14px',
                      fontSize: '13px',
                    }}
                    onClick={() => handleDelete(bk)}
                    disabled={isSubmitting}
                  >
                    删除备份
                  </button>
                  <button
                    className="button button-primary"
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                    onClick={() => handleRestore(bk.backupId)}
                    disabled={isSubmitting}
                  >
                    恢复此备份
                  </button>
                </div>
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
                        flexDirection: 'column',
                        padding: '6px 0',
                        borderBottom: idx < bk.items.length - 1 ? '1px solid #f1f5f9' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ color: '#0969da', fontWeight: 500, fontSize: '12px' }}>
                          {item.skillName
                            ? `Skill: ${item.skillName}`
                            : item.type === 'registry'
                              ? '注册表快照'
                              : '全局 Skill 库'}
                        </span>
                        <span style={{ color: '#57606a', fontFamily: 'monospace', fontSize: '11px', background: '#eaeef2', padding: '1px 6px', borderRadius: '3px' }}>
                          {item.type}
                        </span>
                      </div>
                      {item.originalPath && (
                        <div style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          原路径: {item.originalPath}
                        </div>
                      )}
                      {item.backupPath && (
                        <div style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all', marginTop: '2px' }}>
                          备份路径: {item.backupPath}
                        </div>
                      )}
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
