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
  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <strong style={{ fontSize: '15px', color: '#17202a' }}>{name}</strong>
        <div style={{ fontSize: '11px', color: '#57606a', marginTop: '4px' }}>
          v{version} | {checksum.slice(0, 15)}...
        </div>
      </td>
      <td style={{ verticalAlign: 'top', color: '#354557' }}>{description}</td>
      <td style={{ verticalAlign: 'top' }}>
        <div className="target-list">
          {enabledTargets.map((targetKey) => {
            const status = targets[targetKey] || 'missing'
            const badgeClass = `badge-${status}`

            return (
              <div key={targetKey} className="target-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{targetKey.split(':')[0]}</span>
                  <span className={`badge ${badgeClass}`}>{status}</span>
                </div>
                <div className="target-actions">
                  <button
                    className="button"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                    onClick={() => onPlanSync(targetKey)}
                  >
                    Sync ↑
                  </button>
                  {(status === 'changed' || status === 'conflict') && (
                    <button
                      className="button"
                      style={{ padding: '3px 8px', fontSize: '11px', background: '#fcf0f0', borderColor: '#fad2d2' }}
                      onClick={() => onPlanSync('local', targetKey)}
                    >
                      Pull ↓
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {enabledTargets.length === 0 && (
            <span style={{ color: '#57606a', fontSize: '12px' }}>No targets enabled</span>
          )}
        </div>
      </td>
      <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
        <button
          className="button button-primary"
          onClick={() => onPlanSync()}
          disabled={enabledTargets.length === 0}
        >
          Sync All Targets
        </button>
      </td>
    </tr>
  )
}
