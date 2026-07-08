export interface DiffViewProps {
  diff: string
}

export function DiffView({ diff }: DiffViewProps) {
  if (!diff || diff.trim() === '') {
    return (
      <div
        className="empty-state"
        style={{ padding: '20px', background: '#f8fafc', color: '#64748b', borderRadius: '8px' }}
      >
        没有变更差异。
      </div>
    )
  }

  const lines = diff.split('\n')

  return (
    <pre
      style={{
        background: '#0f172a',
        color: '#e2e8f0',
        padding: '16px',
        borderRadius: '8px',
        overflowX: 'auto',
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '12px',
        lineHeight: '1.6',
        margin: 0,
      }}
    >
      {lines.map((line, idx) => {
        let style: React.CSSProperties = {}
        if (line.startsWith('+') && !line.startsWith('+++')) {
          style = { color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', display: 'block', padding: '0 4px' }
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          style = { color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', display: 'block', padding: '0 4px' }
        } else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
          style = { color: '#94a3b8', fontWeight: 'bold' }
        }
        return (
          <span key={idx} style={style}>
            {line}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}
