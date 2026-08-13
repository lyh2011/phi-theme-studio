import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, SlidersHorizontal } from 'lucide-react'
import { PREVIEW_OPTIONS, type PreviewOption, type PreviewOptions } from '../editor/preview'

interface PreviewOptionsMenuProps {
  options: PreviewOptions
  onChange: (option: PreviewOption, enabled: boolean) => void
}

const MENU_WIDTH = 296

export function PreviewOptionsMenu({ options, onChange }: PreviewOptionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const activeCount = PREVIEW_OPTIONS.filter(({ id }) => options[id]).length

  // The canvas view bar scrolls horizontally on narrow screens, which would clip
  // an absolutely positioned menu, so the panel is anchored in viewport space.
  const placeMenu = useCallback(() => {
    const bounds = buttonRef.current?.getBoundingClientRect()
    if (!bounds) return
    const maxLeft = Math.max(8, window.innerWidth - MENU_WIDTH - 8)
    setAnchor({ top: bounds.bottom + 6, left: Math.min(bounds.left, maxLeft) })
  }, [])

  useEffect(() => {
    if (!open) return
    placeMenu()
    const dismiss = (event: Event) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target)) return
      setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open, placeMenu])

  return (
    <div className="preview-options" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className={open ? 'active' : ''}
        aria-expanded={open}
        aria-controls={menuId}
        title="切换 phi-plugin 条件元素在画布中的显示"
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal size={13} aria-hidden="true" />
        可选元素
        <span className="preview-options-count">{activeCount}</span>
      </button>
      {open && (
        <div
          className="preview-options-menu"
          id={menuId}
          role="group"
          aria-label="可选运行时元素"
          style={{ top: anchor.top, left: anchor.left }}
        >
          <p>这些区块只在特定存档或插件设置下渲染，勾选后可在画布中定位并调整样式。</p>
          {PREVIEW_OPTIONS.map(({ id, label, hint }) => (
            <label key={id} title={hint}>
              <input type="checkbox" checked={options[id]} onChange={(event) => onChange(id, event.target.checked)} />
              <span className="preview-options-check" aria-hidden="true">{options[id] && <Check size={11} />}</span>
              <span className="preview-options-text">
                <strong>{label}</strong>
                <em>{hint}</em>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
