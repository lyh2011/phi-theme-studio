import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'

interface SourceDialogProps {
  open: boolean
  css: string
  template: string
  yaml: string
  cssLabel?: string
  templateEditable?: boolean
  onClose: () => void
  onApply: (css: string, template: string) => void
}

type SourceTab = 'css' | 'template' | 'yaml'

export function SourceDialog({
  open,
  css,
  template,
  yaml,
  cssLabel = 'b19.css',
  templateEditable = true,
  onClose,
  onApply,
}: SourceDialogProps) {
  const [tab, setTab] = useState<SourceTab>('css')
  const [cssValue, setCssValue] = useState(css)
  const [templateValue, setTemplateValue] = useState(template)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTab('css')
    setCssValue(css)
    setTemplateValue(template)
    setError('')
  }, [open, css, template, templateEditable])

  if (!open) return null
  const apply = () => {
    try {
      onApply(cssValue, templateValue)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="source-dialog-title">
        <header>
          <div>
            <h2 id="source-dialog-title">主题源码</h2>
            <span>{tab === 'template' && templateValue.trim() ? '将覆盖插件内置模板' : 'CSS 覆盖模式'}</span>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <nav className="source-tabs" aria-label="源码类型">
          <button type="button" className={tab === 'css' ? 'active' : ''} onClick={() => setTab('css')}>{cssLabel}</button>
          {templateEditable && <button type="button" className={tab === 'template' ? 'active' : ''} onClick={() => setTab('template')}>b19.art</button>}
          <button type="button" className={tab === 'yaml' ? 'active' : ''} onClick={() => setTab('yaml')}>info.yaml</button>
        </nav>
        <div className="source-editor">
          {tab === 'css' && <textarea value={cssValue} onChange={(event) => setCssValue(event.target.value)} spellCheck={false} aria-label="CSS 源码" />}
          {tab === 'template' && <textarea value={templateValue} onChange={(event) => setTemplateValue(event.target.value)} spellCheck={false} placeholder="留空以使用 phi-plugin 内置 b19.art" aria-label="ArtTemplate 源码" />}
          {tab === 'yaml' && <pre>{yaml}</pre>}
        </div>
        <footer>
          {error ? <div className="dialog-error">{error}</div> : <span />}
          <button type="button" className="secondary-command" onClick={onClose}>取消</button>
          <button type="button" className="primary-command" onClick={apply}><Check size={16} />应用</button>
        </footer>
      </div>
    </div>
  )
}
