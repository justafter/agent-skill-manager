import { useState } from 'react'

export interface SkillCardProps {
  name: string
  description: string
  version: string
  checksum: string
  localPath?: string
  development?: {
    status: 'identical' | 'changed' | 'missing' | 'invalid'
    localPath: string
    checksum?: string
    lastModified?: string
    error?: string
  }
  targets: Record<string, string>
  syncedTargets: string[]
  projectInstalls: any[]
  installedPaths?: Record<string, string>
  enabledTargets: string[]
  onPlanSync: (toTarget?: string, fromTarget?: string) => void
  onRefreshFromLocal?: () => void
  isRefreshingFromLocal?: boolean
  watchState?: { status: 'watching' | 'success' | 'error'; lastSyncedAt: string; error?: string } | null
  onToggleWatch?: (enabled: boolean) => void
}

export function SkillCard({
  name,
  description,
  version,
  checksum,
  localPath,
  development,
  targets,
  syncedTargets,
  projectInstalls,
  installedPaths,
  enabledTargets,
  onPlanSync,
  onRefreshFromLocal,
  isRefreshingFromLocal,
  watchState,
  onToggleWatch
}: SkillCardProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [showPaths, setShowPaths] = useState(false)

  // SVGs for Agent Icons
  // SVGs for Agent Icons
  const renderAgentIcon = (agent: string) => {
    if (agent === 'claude') {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
        </svg>
      )
    }
    if (agent === 'codex') {
      return (
        <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
          <path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 1.634-1.285z" />
        </svg>
      )
    }
    if (agent === 'gemini') {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
        </svg>
      )
    }
    // Fallback
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    )
  }

  const statusLabels: Record<string, string> = {
    missing: '缺失',
    identical: '一致',
    changed: '已修改',
    conflict: '冲突'
  }

  const getStatusLabel = (agent: string, stat: string) => {
    if (agent === 'gemini') {
      if (stat === 'missing') return '未同步'
      return '路径已写入但加载未验证'
    }
    return statusLabels[stat] || stat
  }

  const developmentMessage = (() => {
    if (!development || development.status === 'identical') return null
    if (development.status === 'changed') {
      return '开发目录有变更，需要先更新本地库后再同步到目标 Agent。'
    }
    if (development.status === 'missing') {
      return '导入目录不存在，无法检查开发目录变更。'
    }
    return `导入目录校验失败: ${development.error || '未知错误'}`
  })()

  return (
    <div className="skill-row">
      {/* Click outside overlay for popovers */}
      {activeDropdown && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90, cursor: 'default' }} 
          onClick={() => setActiveDropdown(null)} 
        />
      )}

      <div className="skill-left">
        <div className="skill-name-row">
          <h4 className="skill-title">{name}</h4>
          <span className="skill-tag">本地</span>
        </div>
        <p className="skill-description" title={description}>{description}</p>
        {localPath && (
          <p
            className="skill-desc"
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#64748b',
              marginTop: '4px',
              wordBreak: 'break-all'
            }}
            title={localPath}
          >
            导入目录: {localPath}
          </p>
        )}
        {developmentMessage && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 10px',
              border: '1px solid #facc15',
              background: '#fefce8',
              color: '#854d0e',
              borderRadius: '4px',
              fontSize: '12px',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>{developmentMessage}</span>
            {development?.status === 'changed' && onRefreshFromLocal && (
              <button
                type="button"
                className="button"
                style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
                onClick={onRefreshFromLocal}
                disabled={isRefreshingFromLocal}
              >
                {isRefreshingFromLocal ? '正在更新...' : '更新本地库'}
              </button>
            )}
          </div>
        )}
        {installedPaths && Object.keys(installedPaths).length > 0 && (
          <div style={{ marginTop: '6px' }}>
            <button
              type="button"
              onClick={() => setShowPaths((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#2563eb',
                cursor: 'pointer',
                padding: 0,
                fontSize: '12px',
                textDecoration: 'underline'
              }}
            >
              {showPaths ? '收起已安装路径 ▴' : `查看已安装路径（${Object.keys(installedPaths).length} 处）▾`}
            </button>
            {showPaths && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '8px 10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              >
                {Object.entries(installedPaths).map(([target, path]) => {
                  const agent = target.split(':')[0]
                  const scope = target.split(':')[1]
                  return (
                    <div
                      key={target}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        padding: '4px 0'
                      }}
                    >
                      <span
                        className="skill-tag"
                        style={{
                          background:
                            agent === 'claude' ? '#fdf0ec' :
                            agent === 'codex' ? '#ebfbee' :
                            agent === 'gemini' ? '#ebf8ff' : '#faf5ff',
                          color:
                            agent === 'claude' ? '#c05621' :
                            agent === 'codex' ? '#2f855a' :
                            agent === 'gemini' ? '#2b6cb0' : '#6b46c1',
                          flexShrink: 0,
                          minWidth: '90px',
                          textAlign: 'center'
                        }}
                      >
                        {agent.toUpperCase()} · {scope}
                      </span>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          color: '#1e293b',
                          wordBreak: 'break-all',
                          flex: 1,
                          minWidth: 0
                        }}
                      >
                        {path}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="skill-right">
        {enabledTargets.map((targetKey) => {
          const agentName = targetKey.split(':')[0]
          const status = targets[targetKey] || 'missing'
          const isActive = status !== 'missing'
          const btnClass = isActive ? `active-${status}` : ''
          const isDropdownOpen = activeDropdown === targetKey

          return (
            <div key={targetKey} style={{ position: 'relative', zIndex: isDropdownOpen ? 95 : 1 }}>
              <button
                className={`agent-btn agent-${agentName} ${btnClass}`}
                onClick={() => setActiveDropdown(isDropdownOpen ? null : targetKey)}
                title={`${agentName}: ${getStatusLabel(agentName, status)}`}
              >
                {renderAgentIcon(agentName)}

                {/* Show a colored dot on top of button if status is changed or conflict */}
                {(status === 'changed' || status === 'conflict') && (
                  <span className={`status-dot dot-${status}`} />
                )}
              </button>

              {isDropdownOpen && (
                <div className="popover-menu">
                  <div className="popover-header">
                    <strong>{agentName}</strong> ({getStatusLabel(agentName, status)})
                  </div>
                  
                  <button
                    className="popover-item"
                    onClick={() => {
                      onPlanSync(targetKey)
                      setActiveDropdown(null)
                    }}
                  >
                    推送同步 (Push) ↑
                  </button>

                  {(status === 'changed' || status === 'conflict') && (
                    <button
                      className="popover-item"
                      onClick={() => {
                        onPlanSync('local', targetKey)
                        setActiveDropdown(null)
                      }}
                    >
                      反向拉取 (Pull) ↓
                    </button>
                  )}

                  <button
                    className="popover-item"
                    onClick={() => {
                      onPlanSync()
                      setActiveDropdown(null)
                    }}
                  >
                    同步所有目标
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
