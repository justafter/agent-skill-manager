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
          message: `[跳过] 由于已存在相同校验和的 Skill，跳过导入 "${res.skill.name}"。`
        })
      } else {
        setFeedback({
          type: 'success',
          message: `[成功] Skill "${res.skill.name}" (v${res.skill.version}) 已成功导入到本地库！`
        })
      }
      setSourcePath('')
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `导入失败: ${(err as Error).message}`
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>导入 Skill 到本地库</h2>
      <p style={{ color: '#57606a', fontSize: '14px', marginBottom: '24px' }}>
        请输入您想导入的 Skill 的绝对目录路径。管理器将在写入本地库前校验其 SKILL.md 中的 Frontmatter 元数据。
      </p>

      <form onSubmit={handleSubmit} style={{ background: '#ffffff', border: '1px solid #d8dee9', borderRadius: '8px', padding: '24px' }}>
        <div className="form-group">
          <label htmlFor="path">源目录路径 (绝对路径)</label>
          <input
            id="path"
            type="text"
            className="form-input"
            placeholder="例如：C:\users\dev\my-new-skill"
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
            <span>强制覆写 (覆盖前会创建注册表与本地备份)</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => setSkip(e.target.checked)}
              disabled={isSubmitting}
            />
            <span>如果校验和一致则跳过</span>
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
            {isSubmitting ? '正在导入...' : '导入 Skill'}
          </button>
        </div>
      </form>
    </section>
  )
}
