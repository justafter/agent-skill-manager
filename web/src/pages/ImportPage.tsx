import { useState } from 'react'
import { apiPost } from '../api/client'

export function ImportPage() {
  const [sourcePath, setSourcePath] = useState('')
  const [force, setForce] = useState(false)
  const [skip, setSkip] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sourcePath.trim()) return

    try {
      setIsSubmitting(true)
      setFeedback(null)
      const res = await apiPost<any>('/api/import', {
        path: sourcePath.trim(),
        force,
        skip
      })

      if (res.skipped) {
        setFeedback({
          type: 'success',
          message: `[Skip] Skill "${res.skill.name}" was skipped because an identical checksum matches.`
        })
      } else {
        setFeedback({
          type: 'success',
          message: `[Success] Skill "${res.skill.name}" (v${res.skill.version}) imported successfully to local library!`
        })
      }
      setSourcePath('')
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Import failed: ${(err as Error).message}`
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Import Skill to Local Library</h2>
      <p style={{ color: '#57606a', fontSize: '14px', marginBottom: '24px' }}>
        Provide the absolute directory path of the skill you want to import. The manager will validate the frontmatter in its SKILL.md before writing it to the local library.
      </p>

      <form onSubmit={handleSubmit} style={{ background: '#ffffff', border: '1px solid #d8dee9', borderRadius: '8px', padding: '24px' }}>
        <div className="form-group">
          <label htmlFor="path">Source Directory Path (Absolute)</label>
          <input
            id="path"
            type="text"
            className="form-input"
            placeholder="e.g. C:\users\dev\my-new-skill"
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              disabled={isSubmitting}
            />
            <span>Force Overwrite (Creates registry/local backup before overwriting)</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => setSkip(e.target.checked)}
              disabled={isSubmitting}
            />
            <span>Skip if identical checksum matches</span>
          </label>
        </div>

        {feedback && (
          <div
            className="empty-state"
            style={{
              marginTop: '20px',
              padding: '12px',
              fontSize: '13px',
              background: feedback.type === 'success' ? '#dafbe1' : '#ffebe9',
              color: feedback.type === 'success' ? '#1a7f37' : '#cf222e',
              border: feedback.type === 'success' ? '1px solid #c4f2d2' : '1px solid #ffc8c4'
            }}
          >
            {feedback.message}
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="button button-primary"
            disabled={isSubmitting || !sourcePath.trim()}
          >
            {isSubmitting ? 'Importing...' : 'Import Skill'}
          </button>
        </div>
      </form>
    </section>
  )
}
