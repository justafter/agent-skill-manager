import { useState } from 'react'

export interface SkillCardProps {
  name: string
  description: string
  version: string
  checksum: string
  targets: Record<string, string>
  syncedTargets: string[]
  projectInstalls: any[]
  enabledTargets: string[]
  onPlanSync: (toTarget?: string, fromTarget?: string) => void
}

export function SkillCard({
  name,
  description,
  version,
  checksum,
  targets,
  syncedTargets,
  projectInstalls,
  enabledTargets,
  onPlanSync
}: SkillCardProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  // SVGs for Agent Icons
  const renderAgentIcon = (agent: string) => {
    if (agent === 'claude') {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="6.34" y1="6.34" x2="17.66" y2="17.66" />
          <line x1="6.34" y1="17.66" x2="17.66" y2="6.34" />
          <line x1="12" y1="12" x2="17.5" y2="9.5" />
          <line x1="12" y1="12" x2="6.5" y2="14.5" />
          <line x1="12" y1="12" x2="9.5" y2="6.5" />
          <line x1="12" y1="12" x2="14.5" y2="17.5" />
        </svg>
      )
    }
    if (agent === 'codex') {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5-2.6-.6-5.9 2-7.4l7.6-4.4M12 10.5v8M19.5 7.5c1.5 2.6.6 5.9-2 7.4l-7.6 4.4M12 13.5v-8" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
      )
    }
    if (agent === 'gemini') {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z" />
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
                title={`${agentName}: ${statusLabels[status] || status}`}
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
                    <strong>{agentName}</strong> ({statusLabels[status] || status})
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
