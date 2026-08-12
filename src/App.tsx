import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from 'grapesjs'
import {
  Check,
  ChevronDown,
  Code2,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FolderOpen,
  Image,
  Layers3,
  Menu,
  PackageCheck,
  Paintbrush,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Scan,
  Settings2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { AssetForm, type UploadTarget } from './components/AssetForm'
import { ComponentNavigator } from './components/ComponentNavigator'
import { GrapesCanvas } from './components/GrapesCanvas'
import { PackagePanel } from './components/PackagePanel'
import { SourceDialog } from './components/SourceDialog'
import { ThemeForm } from './components/ThemeForm'
import { lockEditorDocument, resetEditorDocument } from './editor/createEditor'
import { applyRuntimePreview } from './editor/preview'
import {
  assetFromFile,
  extensionOf,
  formatBytes,
  hydrateAsset,
  normalizedAssetName,
  revokeAssets,
} from './lib/assets'
import { clearPersistedProject, loadPersistedProject, savePersistedProject } from './lib/persistence'
import {
  cssForPreview,
  exportThemePackage,
  importThemePackage,
  manifestYaml,
  mapProjectAssetUrls,
  rewriteCssUrls,
  validateTheme,
  validateThemeCss,
  validateStudioProjectData,
} from './lib/themePackage'
import {
  DEFAULT_DRAFT,
  DEFAULT_RESOURCES,
  type PackageAsset,
  type ThemeDraft,
  type ThemeResources,
} from './types/theme'
import './App.css'

type LeftTab = 'components' | 'layers'
type RightTab = 'style' | 'theme' | 'assets' | 'package'
type SaveState = 'loading' | 'saved' | 'saving' | 'dirty'
type Toast = { kind: 'success' | 'error' | 'info'; message: string }

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

function assetUrlMap(assets: PackageAsset[]) {
  const map = new Map<string, string>()
  for (const asset of assets) {
    map.set(asset.previewUrl, asset.path)
    map.set(asset.path, asset.path)
    map.set(`./${asset.path}`, asset.path)
  }
  return map
}

function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [draft, setDraft] = useState<ThemeDraft>(DEFAULT_DRAFT)
  const [resources, setResources] = useState<ThemeResources>(DEFAULT_RESOURCES)
  const [assets, setAssets] = useState<PackageAsset[]>([])
  const [customTemplate, setCustomTemplate] = useState('')
  const [leftTab, setLeftTab] = useState<LeftTab>('components')
  const [rightTab, setRightTab] = useState<RightTab>('style')
  const [revision, setRevision] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [zoom, setZoom] = useState(60)
  const [previewMode, setPreviewMode] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('成绩卡')
  const [toast, setToast] = useState<Toast | null>(null)
  const [mobilePanel, setMobilePanel] = useState<'left' | 'right' | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const restoredRef = useRef(false)
  const mountedRef = useRef(true)
  const assetsRef = useRef<PackageAsset[]>([])
  const importGenerationRef = useRef(0)
  const saveGenerationRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const notify = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    setToast({ message, kind })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  useEffect(() => () => {
    mountedRef.current = false
    importGenerationRef.current++
    saveGenerationRef.current++
    revokeAssets(assetsRef.current)
  }, [])

  const handleEditorUpdate = useCallback(() => {
    if (!restoredRef.current) return
    setRevision((value) => value + 1)
    setSaveState('dirty')
  }, [])

  const handleEditorReady = useCallback((instance: Editor) => {
    instance.on('component:selected', (component) => {
      setSelectedName(component.getName() || component.get('name') || '组件')
    })
    void (async () => {
      let restoredAssets: PackageAsset[] | undefined
      try {
        const persisted = await loadPersistedProject()
        if (!mountedRef.current) return
        if (persisted) {
          const safeProject = validateStudioProjectData(persisted.projectData)
          restoredAssets = persisted.assets.map((asset) => hydrateAsset(asset))
          const pathToUrl = new Map(restoredAssets.map((asset) => [asset.path, asset.previewUrl]))
          const projectData = mapProjectAssetUrls(safeProject, pathToUrl)
          setDraft(persisted.draft)
          setResources(persisted.resources)
          assetsRef.current = restoredAssets
          setAssets(restoredAssets)
          setCustomTemplate(persisted.customTemplate)
          instance.loadProjectData(projectData)
          lockEditorDocument(instance)
          instance.UndoManager.clear()
          restoredAssets = undefined
        }
        instance.Canvas.fitViewport({ gap: 28, zoom: (value) => Math.min(value, 80) })
        setZoom(Math.round(instance.Canvas.getZoom()))
        setSaveState('saved')
      } catch (error) {
        if (restoredAssets) revokeAssets(restoredAssets)
        notify(`草稿恢复失败：${error instanceof Error ? error.message : String(error)}`, 'error')
        setSaveState('dirty')
      } finally {
        if (!mountedRef.current) {
          if (restoredAssets) revokeAssets(restoredAssets)
        } else {
          restoredRef.current = true
          setEditor(instance)
          setRevision((value) => value + 1)
        }
      }
    })()
  }, [notify])

  useEffect(() => {
    if (!editor) return
    try {
      const canvasDocument = editor.Canvas.getDocument()
      if (canvasDocument) applyRuntimePreview(canvasDocument, draft, resources, assets)
    } catch {
      // The frame can be between reload states while a project is imported.
    }
  }, [editor, draft, resources, assets, revision])

  useEffect(() => {
    if (!editor || !restoredRef.current) return
    const generation = ++saveGenerationRef.current
    setSaveState('saving')
    const timeout = window.setTimeout(() => {
      const urlToPath = assetUrlMap(assets)
      const projectData = mapProjectAssetUrls(editor.getProjectData(), urlToPath)
      const snapshot = {
        draft,
        resources,
        assets: assets.map(({ previewUrl: _previewUrl, ...asset }) => asset),
        customTemplate,
        projectData,
      }
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => savePersistedProject(snapshot))
        .then(() => {
          if (mountedRef.current && generation === saveGenerationRef.current) setSaveState('saved')
        })
        .catch((error) => {
          if (!mountedRef.current || generation !== saveGenerationRef.current) return
          setSaveState('dirty')
          notify(`自动保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
        })
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [editor, draft, resources, assets, customTemplate, revision, notify])

  const canonical = (() => {
    if (!editor) return { css: '', error: '' }
    try {
      const raw = editor.getCss({ avoidProtected: true, keepUnusedStyles: true }) || ''
      const urlToPath = assetUrlMap(assets)
      const checked = validateThemeCss(raw, urlToPath)
      return { css: rewriteCssUrls(checked, (url) => urlToPath.get(url) || url), error: '' }
    } catch (error) {
      return { css: '', error: error instanceof Error ? error.message : String(error) }
    }
  })()
  const canonicalCss = canonical.css
  const exportInput = useMemo(() => ({
    draft,
    resources,
    assets,
    css: canonicalCss,
    customTemplate,
  }), [draft, resources, assets, canonicalCss, customTemplate])
  const issues = useMemo(() => {
    const result = validateTheme(exportInput)
    return canonical.error ? [{ level: 'error' as const, message: canonical.error }, ...result] : result
  }, [exportInput, canonical.error])
  const yaml = useMemo(() => manifestYaml(exportInput), [exportInput])
  const assetBytes = useMemo(() => assets.reduce((total, asset) => total + asset.bytes.byteLength, 0), [assets])

  const updateZoom = (value: number) => {
    if (!editor) return
    const next = Math.max(20, Math.min(100, Math.round(value)))
    editor.Canvas.setZoom(next)
    setZoom(next)
  }

  const fitCanvas = () => {
    if (!editor) return
    editor.Canvas.fitViewport({ gap: 28, zoom: (value) => Math.min(value, 80) })
    window.requestAnimationFrame(() => setZoom(Math.round(editor.Canvas.getZoom())))
  }

  const togglePreview = () => {
    if (!editor) return
    if (previewMode) editor.stopCommand('preview')
    else editor.runCommand('preview')
    setPreviewMode(!previewMode)
  }

  const targetPath = (target: UploadTarget, file: File) => {
    if (target.kind === 'background') return `assets/${normalizedAssetName(file.name, 'background')}`
    if (target.kind === 'font') return `assets/${normalizedAssetName(file.name, 'font')}`
    return `assets/rating/${normalizedAssetName(file.name, target.rating)}`
  }

  const currentTargetPath = (target: UploadTarget) => {
    if (target.kind === 'background') return resources.background
    if (target.kind === 'font') return resources.font
    return resources.icons[target.rating]
  }

  const uploadAsset = async (target: UploadTarget, file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      notify('单个资源不能超过 20 MB', 'error')
      return
    }
    const extension = extensionOf(file.name)
    const allowed = target.kind === 'font'
      ? ['ttf', 'otf', 'woff', 'woff2'].includes(extension)
      : ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(extension)
    if (!allowed) {
      notify('文件类型不受支持', 'error')
      return
    }
    const path = targetPath(target, file)
    const previousPath = currentTargetPath(target)
    const nextAsset = await assetFromFile(file, path)
    setAssets((current) => {
      const removed = current.filter((asset) => asset.path === previousPath || asset.path === path)
      const next = [...current.filter((asset) => asset.path !== previousPath && asset.path !== path), nextAsset]
      assetsRef.current = next
      window.setTimeout(() => revokeAssets(removed), 0)
      return next
    })
    setResources((current) => {
      if (target.kind === 'background') return { ...current, background: path }
      if (target.kind === 'font') return { ...current, font: path }
      return { ...current, icons: { ...current.icons, [target.rating]: path } }
    })
    setSaveState('dirty')
    notify(`${file.name} 已加入主题包`, 'success')
  }

  const removeAsset = (target: UploadTarget) => {
    const path = currentTargetPath(target)
    if (!path) return
    setAssets((current) => {
      const removed = current.filter((asset) => asset.path === path)
      const next = current.filter((asset) => asset.path !== path)
      assetsRef.current = next
      window.setTimeout(() => revokeAssets(removed), 0)
      return next
    })
    setResources((current) => {
      if (target.kind === 'background') {
        const { background: _background, ...rest } = current
        return rest
      }
      if (target.kind === 'font') {
        const { font: _font, ...rest } = current
        return rest
      }
      const icons = { ...current.icons }
      delete icons[target.rating]
      return { ...current, icons }
    })
    setSaveState('dirty')
  }

  const importPackage = async (file: File) => {
    if (!editor) return
    const generation = ++importGenerationRef.current
    saveGenerationRef.current++
    let imported: Awaited<ReturnType<typeof importThemePackage>> | undefined
    try {
      imported = await importThemePackage(file)
      if (!mountedRef.current || generation !== importGenerationRef.current) {
        revokeAssets(imported.assets)
        return
      }
      const previousAssets = assetsRef.current
      if (previewMode) {
        editor.stopCommand('preview')
        setPreviewMode(false)
      }
      if (imported.projectData) {
        editor.loadProjectData(imported.projectData)
        // b19.css remains the source of truth even when studio.json restores the component tree.
        editor.setStyle(cssForPreview(imported.css, imported.assets))
        lockEditorDocument(editor)
        editor.UndoManager.clear()
      } else {
        resetEditorDocument(editor, cssForPreview(imported.css, imported.assets))
      }
      const next = imported
      setDraft(next.draft)
      setResources(next.resources)
      assetsRef.current = next.assets
      setAssets(next.assets)
      setCustomTemplate(next.customTemplate)
      imported = undefined
      window.setTimeout(() => revokeAssets(previousAssets), 0)
      setRevision((value) => value + 1)
      setSaveState('dirty')
      setSelectedName('成绩卡')
      fitCanvas()
      const suffix = next.warnings.length ? `；${next.warnings.join('；')}` : ''
      notify(`已导入 ${file.name}${suffix}`, next.warnings.length ? 'info' : 'success')
    } catch (error) {
      if (imported) revokeAssets(imported.assets)
      notify(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const createNew = async () => {
    if (!editor) return
    if ((saveState === 'dirty' || saveState === 'saving') && !window.confirm('当前改动尚未自动保存，仍要新建主题吗？')) return
    importGenerationRef.current++
    saveGenerationRef.current++
    if (previewMode) {
      editor.stopCommand('preview')
      setPreviewMode(false)
    }
    const previousAssets = assetsRef.current
    assetsRef.current = []
    setDraft(DEFAULT_DRAFT)
    setResources(DEFAULT_RESOURCES)
    setAssets([])
    setCustomTemplate('')
    resetEditorDocument(editor)
    await clearPersistedProject()
    revokeAssets(previousAssets)
    setRevision((value) => value + 1)
    setSaveState('dirty')
    setSelectedName('成绩卡')
    notify('已创建空白主题', 'success')
  }

  const exportPackage = async () => {
    if (!editor) return
    try {
      const blob = await exportThemePackage({ ...exportInput, projectData: editor.getProjectData() })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${draft.id.trim()}.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify(`${anchor.download} 已生成`, 'success')
    } catch (error) {
      notify(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const applySource = (css: string, template: string) => {
    if (!editor) return
    validateThemeCss(css, assetUrlMap(assets))
    editor.setStyle(cssForPreview(css, assets))
    setCustomTemplate(template)
    setRevision((value) => value + 1)
    setSaveState('dirty')
  }

  const saveLabel = {
    loading: '正在恢复',
    saving: '保存中',
    saved: '已自动保存',
    dirty: '有未保存改动',
  }[saveState]

  return (
    <div className="studio-app">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">P</div>
          <div>
            <strong>Phi Theme Studio</strong>
            <span>{draft.id || 'untitled'}</span>
          </div>
        </div>

        <div className="mobile-panel-buttons">
          <button type="button" className="icon-button" title="左侧面板" onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')}><PanelLeft size={18} /></button>
          <button type="button" className="icon-button" title="右侧面板" onClick={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')}><PanelRight size={18} /></button>
        </div>

        <div className="editor-toolbar" role="toolbar" aria-label="编辑工具">
          <button type="button" className="icon-button" title="撤销" disabled={!editor?.UndoManager.hasUndo()} onClick={() => editor?.UndoManager.undo()}><Undo2 size={17} /></button>
          <button type="button" className="icon-button" title="重做" disabled={!editor?.UndoManager.hasRedo()} onClick={() => editor?.UndoManager.redo()}><Redo2 size={17} /></button>
          <span className="toolbar-divider" />
          <button type="button" className="icon-button" title="缩小" onClick={() => updateZoom(zoom - 10)}><ZoomOut size={17} /></button>
          <button type="button" className="zoom-readout" title="当前缩放" onClick={fitCanvas}>{zoom}%</button>
          <button type="button" className="icon-button" title="放大" onClick={() => updateZoom(zoom + 10)}><ZoomIn size={17} /></button>
          <button type="button" className="icon-button" title="适应画布" onClick={fitCanvas}><Scan size={17} /></button>
          <span className="toolbar-divider" />
          <button type="button" className={`icon-button ${previewMode ? 'active' : ''}`} title={previewMode ? '退出预览' : '预览'} onClick={togglePreview}>
            {previewMode ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button type="button" className="icon-button" title="主题源码" onClick={() => setSourceOpen(true)}><Code2 size={17} /></button>
        </div>

        <div className="topbar-status" title={saveLabel}>
          <span className={`save-dot is-${saveState}`} />
          {saveLabel}
        </div>
        <div className="topbar-actions">
          <button type="button" className="secondary-command compact" onClick={createNew}><Plus size={16} />新建</button>
          <button type="button" className="secondary-command compact" onClick={() => importInputRef.current?.click()}><FolderOpen size={16} />导入</button>
          <button type="button" className="primary-command compact" onClick={exportPackage} disabled={issues.some((issue) => issue.level === 'error')}><Download size={16} />导出</button>
          <input ref={importInputRef} type="file" accept=".zip,application/zip" hidden onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importPackage(file)
            event.target.value = ''
          }} />
        </div>
      </header>

      <main className="studio-workspace">
        <aside className={`left-sidebar ${mobilePanel === 'left' ? 'mobile-open' : ''}`}>
          <div className="sidebar-tabs" role="tablist" aria-label="左侧面板">
            <button type="button" role="tab" aria-selected={leftTab === 'components'} className={leftTab === 'components' ? 'active' : ''} onClick={() => setLeftTab('components')}><Menu size={15} />组件</button>
            <button type="button" role="tab" aria-selected={leftTab === 'layers'} className={leftTab === 'layers' ? 'active' : ''} onClick={() => setLeftTab('layers')}><Layers3 size={15} />图层</button>
          </div>
          <div className={`sidebar-content ${leftTab === 'components' ? 'active' : ''}`}>
            <ComponentNavigator editor={editor} />
          </div>
          <div className={`sidebar-content manager-content ${leftTab === 'layers' ? 'active' : ''}`} id="gjs-layer-manager" />
        </aside>

        <section className="canvas-column">
          <div className="canvas-stage">
            <GrapesCanvas onReady={handleEditorReady} onUpdate={handleEditorUpdate} onZoomChange={setZoom} />
          </div>
          <footer className="canvas-statusbar">
            <span><Check size={13} />固定 1200px Bot 画布</span>
            <span className="selected-component">{selectedName}</span>
            <span>{assets.length} 资源 · {formatBytes(assetBytes)}</span>
          </footer>
        </section>

        <aside className={`right-sidebar ${mobilePanel === 'right' ? 'mobile-open' : ''}`}>
          <div className="inspector-tabs" role="tablist" aria-label="检查器">
            {([
              ['style', Paintbrush, '样式'],
              ['theme', Settings2, '主题'],
              ['assets', Image, '资源'],
              ['package', PackageCheck, '导出'],
            ] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={rightTab === id} className={rightTab === id ? 'active' : ''} title={label} onClick={() => setRightTab(id)}>
                <Icon size={16} /><span>{label}</span>
              </button>
            ))}
          </div>
          <div className={`inspector-content manager-content ${rightTab === 'style' ? 'active' : ''}`}>
            <div className="inspector-heading"><span>当前组件</span><strong>{selectedName}</strong><ChevronDown size={14} /></div>
            <div id="gjs-style-manager" />
            <div id="gjs-trait-manager" />
          </div>
          <div className={`inspector-content ${rightTab === 'theme' ? 'active' : ''}`}><ThemeForm draft={draft} setDraft={setDraft} /></div>
          <div className={`inspector-content ${rightTab === 'assets' ? 'active' : ''}`}><AssetForm resources={resources} assets={assets} onUpload={(target, file) => void uploadAsset(target, file)} onRemove={removeAsset} /></div>
          <div className={`inspector-content ${rightTab === 'package' ? 'active' : ''}`}><PackagePanel issues={issues} assetCount={assets.length} customTemplate={Boolean(customTemplate.trim())} onSource={() => setSourceOpen(true)} onExport={exportPackage} /></div>
        </aside>
      </main>

      <SourceDialog open={sourceOpen} css={canonicalCss} template={customTemplate} yaml={yaml} onClose={() => setSourceOpen(false)} onApply={applySource} />
      {toast && <div className={`toast is-${toast.kind}`} role="status"><FileArchive size={16} />{toast.message}</div>}
    </div>
  )
}

export default App
