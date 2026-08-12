import type { Dispatch, SetStateAction } from 'react'
import { DIFFICULTY_KEYS, type ThemeDraft } from '../types/theme'

interface ThemeFormProps {
  draft: ThemeDraft
  setDraft: Dispatch<SetStateAction<ThemeDraft>>
}

export function ThemeForm({ draft, setDraft }: ThemeFormProps) {
  const update = <K extends keyof ThemeDraft>(key: K, value: ThemeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="inspector-form">
      <section className="form-section">
        <h2>主题信息</h2>
        <label>
          <span>名称</span>
          <input value={draft.name} onChange={(event) => update('name', event.target.value)} maxLength={64} />
        </label>
        <label>
          <span>ID</span>
          <input value={draft.id} onChange={(event) => update('id', event.target.value.toLowerCase())} maxLength={48} spellCheck={false} />
        </label>
        <label>
          <span>作者</span>
          <input value={draft.author} onChange={(event) => update('author', event.target.value)} maxLength={64} />
        </label>
        <label>
          <span>说明</span>
          <textarea value={draft.description} onChange={(event) => update('description', event.target.value)} rows={3} maxLength={160} />
        </label>
      </section>

      <section className="form-section">
        <h2>难度色</h2>
        <div className="color-list">
          {DIFFICULTY_KEYS.map((key) => (
            <label className="color-field" key={key}>
              <span className={`difficulty-label difficulty-${key}`}>{key}</span>
              <input
                type="color"
                value={draft.colors[key].slice(0, 7)}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  colors: { ...current.colors, [key]: event.target.value },
                }))}
                aria-label={`${key} 颜色`}
              />
              <input
                className="color-code"
                value={draft.colors[key]}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  colors: { ...current.colors, [key]: event.target.value },
                }))}
                maxLength={9}
                spellCheck={false}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}
