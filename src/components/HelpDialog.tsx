import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { GUIDE_STEPS, type GuideBlock } from '../lib/guide'

interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

function GuideBlockView({ block }: { block: GuideBlock }) {
  if (block.kind === 'text') return <p>{block.text}</p>
  if (block.kind === 'tip') return <p className="guide-tip">{block.text}</p>
  if (block.kind === 'code') return <pre>{block.text}</pre>
  if (block.kind === 'qa') {
    return (
      <dl className="guide-qa">
        {block.items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <dl className="guide-steps">
      {block.items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.text}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, onClose])

  if (!open) return null
  const step = GUIDE_STEPS[index]
  const isLast = index === GUIDE_STEPS.length - 1

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">
        <header>
          <div>
            <h2 id="help-dialog-title">使用指南</h2>
            <span>跟着走一遍，大约五分钟做出第一个主题</span>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button>
        </header>

        <nav className="guide-nav" aria-label="指南章节">
          {GUIDE_STEPS.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              className={itemIndex === index ? 'active' : ''}
              aria-current={itemIndex === index}
              onClick={() => setIndex(itemIndex)}
            >
              <strong>{item.nav}</strong>
              <span>{item.title}</span>
            </button>
          ))}
        </nav>

        <article className="guide-body">
          <h3>{step.title}</h3>
          <p className="guide-lead">{step.lead}</p>
          {step.blocks.map((block, blockIndex) => (
            <GuideBlockView key={`${step.id}-${blockIndex}`} block={block} />
          ))}
        </article>

        <footer>
          <span className="guide-progress">{index + 1} / {GUIDE_STEPS.length}</span>
          <button type="button" className="secondary-command" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <ChevronLeft size={16} />上一步
          </button>
          {isLast ? (
            <button type="button" className="primary-command" onClick={onClose}>开始使用</button>
          ) : (
            <button type="button" className="primary-command" onClick={() => setIndex(index + 1)}>
              下一步<ChevronRight size={16} />
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
