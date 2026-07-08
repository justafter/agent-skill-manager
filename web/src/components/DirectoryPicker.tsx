import { useRef, useState } from 'react'

export interface DirectoryPickerProps {
  id: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
  /**
   * Optional anchor directory shown as a hint when the browser does not expose
   * the absolute path. Web security only gives us the folder name + relative
   * paths, so callers can offer "paste a hint here" guidance.
   */
  hint?: string
}

type PickerStatus =
  { kind: 'idle' } | { kind: 'picked'; via: 'native' | 'webkit'; note?: string } | { kind: 'failed'; message: string }

/**
 * A directory picker that supports three input modes:
 *   1. Type the absolute path manually (always available).
 *   2. Use the File System Access API (`window.showDirectoryPicker`) when
 *      available — gives the real absolute path on Chromium browsers served
 *      over localhost / https.
 *   3. Fallback to a hidden `<input type="file" webkitdirectory>` so any
 *      modern browser can pick a folder. This only exposes the folder name,
 *      so the user must paste/complete the absolute path themselves.
 *
 * The component never silently invents a path: when the chosen mode can't
 * resolve an absolute path, it shows an inline notice asking the user to
 * confirm/paste the full path.
 */
export function DirectoryPicker({ id, value, onChange, placeholder, disabled, hint }: DirectoryPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<PickerStatus>({ kind: 'idle' })

  const supportsNative = typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function'

  const pickNative = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker()
      // Some browsers (Chromium 110+) expose the absolute path on the handle.
      // Fall back to .name when the property is missing (older Chromium / Firefox).
      const absPath: string | undefined = (handle as any).path || handle.name
      if (absPath) {
        onChange(absPath)
        setStatus({ kind: 'picked', via: 'native' })
      } else {
        // Keep whatever the user had before, but warn that only the folder name was returned.
        onChange(handle.name)
        setStatus({
          kind: 'picked',
          via: 'native',
          note: '浏览器仅返回目录名，请补全为绝对路径。',
        })
      }
    } catch (err) {
      // User cancelled the picker (AbortError) — leave value untouched.
      if ((err as Error).name === 'AbortError') return
      setStatus({ kind: 'failed', message: (err as Error).message })
    }
  }

  const onWebkitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    // All selected files share the same root; the first file's webkitRelativePath
    // starts with the chosen folder name.
    const first = files[0] as File & { webkitRelativePath?: string }
    const rel = first.webkitRelativePath || first.name
    const folderName = rel.split('/')[0] || rel
    onChange(folderName)
    setStatus({
      kind: 'picked',
      via: 'webkit',
      note: '浏览器仅返回目录名，请补全为绝对路径。',
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          id={id}
          type="text"
          className="form-input"
          placeholder={placeholder || '例如：D:\\MySkills\\my-new-skill'}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (status.kind !== 'idle') setStatus({ kind: 'idle' })
          }}
          disabled={disabled}
          style={{ flex: 1, minWidth: 0 }}
        />
        {supportsNative ? (
          <button
            type="button"
            className="button"
            onClick={pickNative}
            disabled={disabled}
            title="使用浏览器原生目录选择器（仅 Chromium 系浏览器）"
          >
            选择目录…
          </button>
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            title="弹出系统目录选择对话框"
          >
            选择目录…
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          // @ts-expect-error - non-standard but widely supported
          webkitdirectory=""
          directory=""
          style={{ display: 'none' }}
          onChange={onWebkitChange}
        />
      </div>

      {(status.kind === 'picked' && status.note) || status.kind === 'failed' || hint ? (
        <p
          style={{
            marginTop: '6px',
            fontSize: '12px',
            color: status.kind === 'failed' ? '#cf222e' : status.kind === 'picked' ? '#1a7f37' : '#57606a',
          }}
        >
          {status.kind === 'failed'
            ? `选择目录失败：${status.message}`
            : status.kind === 'picked' && status.note
              ? status.note
              : hint}
        </p>
      ) : null}
    </div>
  )
}
