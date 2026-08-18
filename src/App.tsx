import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from 'grapesjs'
import {
  Check,
  CircleHelp,
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
  RotateCcw,
  Scan,
  Settings2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { AssetForm, type UploadTarget } from './components/AssetForm'
import { ComponentNavigator } from './components/ComponentNavigator'
import { GrapesCanvas } from './components/GrapesCanvas'
import { HelpDialog } from './components/HelpDialog'
import { PackagePanel } from './components/PackagePanel'
import { PreviewOptionsMenu } from './components/PreviewOptionsMenu'
import { SourceDialog } from './components/SourceDialog'
import { ThemeForm } from './components/ThemeForm'
import {
  clearSelectedOverrides,
  describeSelection,
  resetEditorDocument,
  selectAncestor,
  selectedShapeMode,
  selectedStatsTableLayout,
  setCanvasBaseCss,
  setEditorStyle,
  setSelectedShapeMode,
  setStatsTableLayout,
  type ComponentShapeMode,
  type EditorUploadedAsset,
  type StatsTableLayout,
} from './editor/createEditor'
import { runImportTransaction } from './editor/importTransaction'
import { createLatestInstanceGuard } from './editor/latestInstanceGuard'
import { runPageTransition, runProjectResetTransaction } from './editor/projectTransaction'
import {
  appendCustomComponent,
  compactProjectData,
  restoreCustomComponents,
  sourceTemplateForEditing,
  templateForProject,
  type CustomElementKind,
} from './editor/customElements'
import {
  applyRuntimePreview,
  applySharedRuntimePreview,
  applyUserSettingVariant,
  DEFAULT_PREVIEW_OPTIONS,
  DEFAULT_PREVIEW_PAGE,
  DEFAULT_USER_SETTING_VARIANT,
  PREVIEW_PAGE_HEIGHTS,
  PREVIEW_PAGES,
  USER_SETTING_VARIANTS,
  USER_SETTING_VARIANT_HEIGHTS,
  type PreviewOption,
  type PreviewPage,
  type UserSettingVariant,
} from './editor/preview'
import {
  PAGE_DEFINITION_LIST,
  getPageDefinition,
  normalizeRenderTarget as normalizeEditorTarget,
} from './editor/pageRegistry'
import {
  cssForEditorCanvas,
  cssFromEditorCanvas,
  materializePageCssEntry,
  pageCssPathForTarget,
  pageCssPathsForExport,
  pageCssPathsFromMetadata,
  pageCssWithEditableStates,
} from './editor/pageCssWorkspace'
import {
  cssMapReferencesAsset,
  hydratePageAssetReferences,
  pageStatesReferenceAsset,
  rewriteCssMapAssetReferences,
  rewritePageAssetReferences,
} from './editor/pageAssets'
import {
  assetFromFile,
  extensionOf,
  formatBytes,
  hydrateAsset,
  normalizedAssetName,
  revokeAssets,
} from './lib/assets'
import { useFirstRunGuide } from './lib/guide'
import { clearPersistedProject, loadPersistedProject, savePersistedProject } from './lib/persistence'
import {
  cssForPreview,
  exportThemePackage,
  importThemePackage,
  manifestYaml,
  mapProjectAssetUrls,
  resolvePageCss,
  rewriteCssUrls,
  validateTheme,
  validateThemeCss,
  validateStudioProjectData,
} from './lib/themePackage'
import {
  DEFAULT_DRAFT,
  DEFAULT_EXPORT_MODE,
  DEFAULT_RESOURCES,
  type ExportMode,
  type PackageAsset,
  type PageCssMap,
  type RenderTarget,
  type StudioPageState,
  type ThemeDraft,
  type ThemeResources,
} from './types/theme'
import './App.css'

type LeftTab = 'components' | 'layers'
type RightTab = 'style' | 'theme' | 'assets' | 'package'
type SaveState = 'loading' | 'saved' | 'saving' | 'dirty'
type Toast = { kind: 'success' | 'error' | 'info'; message: string }
type CanvasSize = { width: number; height: number }

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_CANVAS_ZOOM = 300
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'])
const PREVIEW_PAGE_LABELS: Record<PreviewPage, string> = {
  b19: 'B19',
  b27: 'B27',
  b30: 'B30',
  b33: 'B33',
  analysis: 'B30数据分析',
}

const PAGE_LABELS: Record<string, string> = Object.fromEntries(
  PAGE_DEFINITION_LIST.map((page) => [page.target, page.label]),
)

function emptyPageStates(): Record<RenderTarget, StudioPageState> {
  return { 'b19/b19': { css: '' } }
}

function emptyManifestCss(): PageCssMap {
  return { 'b19/b19': '' }
}

function isB19Target(target: RenderTarget) {
  return target === 'b19/b19'
}

function isUserSettingTarget(target: RenderTarget) {
  return target === 'setting/userSetting'
}

function pageForTarget(target: RenderTarget) {
  return getPageDefinition(target) || PAGE_DEFINITION_LIST[0]
}

function renderedCanvasSize(editor: Editor, fallback: CanvasSize): CanvasSize {
  const document = editor.Canvas.getDocument()
  const view = document?.defaultView
  const body = document?.body
  if (!view || !body) return fallback
  const style = view.getComputedStyle(body)
  const width = Number.parseFloat(style.width)
  const height = Number.parseFloat(style.height)
  const valid = (value: number) => Number.isFinite(value) && value >= 100 && value <= 20_000
  return {
    width: valid(width) ? Math.round(width) : fallback.width,
    height: valid(height) ? Math.round(height) : fallback.height,
  }
}

function supportedTarget(rawTarget: string) {
  const target = normalizeEditorTarget(rawTarget)
  return target && getPageDefinition(target) ? target : undefined
}

const CUSTOM_ELEMENT_LABELS: Record<CustomElementKind, string> = {
  text: '文字',
  rect: '矩形',
  circle: '圆形',
  line: '线条',
  triangle: '三角形',
  image: '图片',
}

function assetUrlMap(assets: PackageAsset[]) {
  const map = new Map<string, string>()
  for (const asset of assets) {
    map.set(asset.previewUrl, asset.path)
    map.set(asset.path, asset.path)
    map.set(`./${asset.path}`, asset.path)
  }
  return map
}

function isSupportedImage(file: File) {
  return IMAGE_EXTENSIONS.has(extensionOf(file.name))
}

function resourcesWithTarget(resources: ThemeResources, target: UploadTarget, path?: string): ThemeResources {
  if (target.kind === 'background') {
    if (path) return { ...resources, background: path }
    const { background: _background, ...rest } = resources
    return rest
  }
  if (target.kind === 'font') {
    if (path) return { ...resources, font: path }
    const { font: _font, ...rest } = resources
    return rest
  }
  const icons = { ...resources.icons }
  if (path) icons[target.rating] = path
  else delete icons[target.rating]
  return { ...resources, icons }
}

function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [draft, setDraft] = useState<ThemeDraft>(DEFAULT_DRAFT)
  const [resources, setResources] = useState<ThemeResources>(DEFAULT_RESOURCES)
  const [assets, setAssets] = useState<PackageAsset[]>([])
  const [customTemplate, setCustomTemplate] = useState('')
  const [exportMode, setExportMode] = useState<ExportMode>(DEFAULT_EXPORT_MODE)
  const [leftTab, setLeftTab] = useState<LeftTab>('components')
  const [rightTab, setRightTab] = useState<RightTab>('style')
  const [revision, setRevision] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [zoom, setZoom] = useState(60)
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: pageForTarget('b19/b19').width,
    height: PREVIEW_PAGE_HEIGHTS[DEFAULT_PREVIEW_PAGE],
  })
  const [previewMode, setPreviewMode] = useState(false)
  const [previewPage, setPreviewPage] = useState<PreviewPage>(DEFAULT_PREVIEW_PAGE)
  const [userSettingVariant, setUserSettingVariant] = useState<UserSettingVariant>(DEFAULT_USER_SETTING_VARIANT)
  const [activeTarget, setActiveTarget] = useState<RenderTarget>('b19/b19')
  const [pageStates, setPageStates] = useState<Record<RenderTarget, StudioPageState>>(emptyPageStates)
  const [manifestCssByPage, setManifestCssByPage] = useState<PageCssMap>(emptyManifestCss)
  const [pageCssPaths, setPageCssPaths] = useState<Record<string, string>>({})
  const [previewOptions, setPreviewOptions] = useState(DEFAULT_PREVIEW_OPTIONS)
  const [sourceOpen, setSourceOpen] = useState(false)
  const guide = useFirstRunGuide()
  const [selectedName, setSelectedName] = useState('成绩卡')
  const [selectionTick, setSelectionTick] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [mobilePanel, setMobilePanel] = useState<'left' | 'right' | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const customImageInputRef = useRef<HTMLInputElement>(null)
  const editorInstanceRef = useRef<Editor | null>(null)
  const restoredRef = useRef(false)
  const mountedRef = useRef(true)
  const editorLifecycleRef = useRef(createLatestInstanceGuard<Editor>())
  const assetsRef = useRef<PackageAsset[]>([])
  const resourcesRef = useRef<ThemeResources>(DEFAULT_RESOURCES)
  const importGenerationRef = useRef(0)
  const saveGenerationRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pageStatesRef = useRef<Record<RenderTarget, StudioPageState>>(emptyPageStates())
  const manifestCssRef = useRef<PageCssMap>(emptyManifestCss())
  const pageCssPathsRef = useRef<Record<string, string>>({})
  const activeTargetRef = useRef<RenderTarget>('b19/b19')
  const measuredCanvasTargetRef = useRef('')
  // A revision is emitted for every editor mutation. Keep viewport fitting
  // tied to layout changes instead of letting ordinary edits reset manual zoom.
  const lastFittedCanvasKeyRef = useRef<string | undefined>(undefined)
  const pageTransitionRef = useRef(false)
  const projectResetRef = useRef(false)
  const previewPageRef = useRef<PreviewPage>(previewPage)
  const userSettingVariantRef = useRef<UserSettingVariant>(userSettingVariant)
  const previewOptionsRef = useRef(previewOptions)

  const notify = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    setToast({ message, kind })
  }, [])

  const uploadEditorAssets = useCallback(async (files: File[]): Promise<EditorUploadedAsset[]> => {
    const uploaded: PackageAsset[] = []
    const usedPaths = new Set(assetsRef.current.map((asset) => asset.path))
    let serial = 0

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        notify(`${file.name} 超过 20 MB，未加入主题包`, 'error')
        continue
      }
      if (!isSupportedImage(file)) {
        notify(`${file.name} 不是支持的图片格式`, 'error')
        continue
      }

      let path = ''
      do {
        const suffix = `${Date.now().toString(36)}-${serial++}`
        path = `assets/elements/${normalizedAssetName(file.name, `background-${suffix}`)}`
      } while (usedPaths.has(path))
      usedPaths.add(path)

      try {
        uploaded.push(await assetFromFile(file, path))
      } catch (error) {
        notify(`${file.name} 读取失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    }

    if (!uploaded.length) return []
    const next = [...assetsRef.current, ...uploaded]
    assetsRef.current = next
    setAssets(next)
    setSaveState('dirty')
    notify(`${uploaded.length} 张元素背景图已加入主题包`, 'success')
    return uploaded.map((asset) => ({ src: asset.previewUrl, name: asset.path }))
  }, [notify])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  useEffect(() => {
    resourcesRef.current = resources
  }, [resources])

  useEffect(() => {
    if (!editor) return
    const assetManager = editor.AssetManager
    if (!assetManager) return
    const imageAssets = assets.filter((asset) => asset.mime.startsWith('image/'))
    const activeUrls = new Set(imageAssets.map((asset) => asset.previewUrl))
    const collection = assetManager.getAll()

    for (const asset of [...collection.models]) {
      if (!activeUrls.has(asset.getSrc())) assetManager.remove(asset)
    }
    for (const asset of imageAssets) {
      if (!assetManager.get(asset.previewUrl)) {
        assetManager.add({ src: asset.previewUrl, name: asset.path, type: 'image' })
      }
    }
  }, [editor, assets])

  useEffect(() => {
    const editorLifecycle = editorLifecycleRef.current
    const importGeneration = importGenerationRef
    const saveGeneration = saveGenerationRef
    const assetStore = assetsRef
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      editorLifecycle.invalidate()
      importGeneration.current++
      saveGeneration.current++
      revokeAssets(assetStore.current)
    }
  }, [])

  useEffect(() => {
    pageStatesRef.current = pageStates
  }, [pageStates])

  useEffect(() => {
    manifestCssRef.current = manifestCssByPage
  }, [manifestCssByPage])

  useEffect(() => {
    pageCssPathsRef.current = pageCssPaths
  }, [pageCssPaths])

  useEffect(() => {
    previewPageRef.current = previewPage
    userSettingVariantRef.current = userSettingVariant
    previewOptionsRef.current = previewOptions
  }, [previewPage, previewOptions, userSettingVariant])

  const ensurePageCssEntry = useCallback((target: RenderTarget, css?: string) => {
    const current = manifestCssRef.current
    const next = materializePageCssEntry(
      current,
      target,
      css ?? pageStatesRef.current[target]?.css ?? '',
    )
    if (next === current) return
    manifestCssRef.current = next
    setManifestCssByPage(next)
  }, [])

  const snapshotPageState = useCallback((target: RenderTarget, instance = editor) => {
    if (!instance) return pageStatesRef.current[target] || { css: '' }
    try {
      const urlToPath = assetUrlMap(assetsRef.current)
      const raw = cssFromEditorCanvas(
        instance.getCss({ avoidProtected: true, keepUnusedStyles: true }) || '',
      )
      const css = rewriteCssUrls(validateThemeCss(raw, urlToPath), (url) => urlToPath.get(url) || url)
      const projectData = compactProjectData(
        mapProjectAssetUrls(instance.getProjectData(), urlToPath),
      )
      const current = pageStatesRef.current[target] || { css: '' }
      return {
        ...current,
        css,
        projectData,
        dirty: false,
      }
    } catch {
      return pageStatesRef.current[target] || { css: '' }
    }
  }, [editor])

  const capturePageState = useCallback((target: RenderTarget = activeTargetRef.current) => {
    const next = snapshotPageState(target)
    const all = { ...pageStatesRef.current, [target]: next }
    pageStatesRef.current = all
    setPageStates(all)
    return next
  }, [snapshotPageState])

  const applyPageState = useCallback((target: RenderTarget, state: StudioPageState, instance = editor) => {
    if (!instance) return
    const page = pageForTarget(target)
    const activeAssets = assetsRef.current
    const activeResources = resourcesRef.current
    const hydratedState = hydratePageAssetReferences(state, activeAssets)
    pageTransitionRef.current = true
    try {
      resetEditorDocument(instance, cssForEditorCanvas(hydratedState.css), page.markup)
      setCanvasBaseCss(instance, page.pageCssForPreview)
      if (hydratedState.projectData && page.capabilities.customElements) {
        restoreCustomComponents(instance, hydratedState.projectData)
      }
      const canvasDocument = instance.Canvas.getDocument()
      if (canvasDocument) {
        if (isB19Target(target)) applyRuntimePreview(canvasDocument, draft, activeResources, activeAssets, previewPage, previewOptions)
        else {
          const height = isUserSettingTarget(target)
            ? USER_SETTING_VARIANT_HEIGHTS[userSettingVariant]
            : page.height
          applySharedRuntimePreview(canvasDocument, draft, activeResources, activeAssets, height)
          if (isUserSettingTarget(target)) applyUserSettingVariant(canvasDocument, userSettingVariant)
        }
      }
      instance.UndoManager.clear()
      instance.Canvas.fitViewport({ gap: 28, zoom: (value) => Math.min(value, 80) })
    } finally {
      pageTransitionRef.current = false
    }
    setSelectionTick((value) => value + 1)
    setRevision((value) => value + 1)
  }, [draft, editor, previewOptions, previewPage, userSettingVariant])

  const handleEditorUpdate = useCallback(() => {
    if (!restoredRef.current || pageTransitionRef.current || projectResetRef.current) return
    if (editorInstanceRef.current?.UndoManager.hasUndo()) {
      ensurePageCssEntry(activeTargetRef.current)
    }
    setRevision((value) => value + 1)
    setSaveState('dirty')
  }, [ensurePageCssEntry])

  const handleEditorReady = useCallback((instance: Editor) => {
    const editorGeneration = editorLifecycleRef.current.activate(instance)
    editorInstanceRef.current = instance
    measuredCanvasTargetRef.current = ''
    lastFittedCanvasKeyRef.current = undefined
    const isCurrentEditor = () => mountedRef.current && editorGeneration.isCurrent()
    restoredRef.current = false
    instance.on('component:selected', (component) => {
      if (!isCurrentEditor()) return
      setSelectedName(component.getName() || component.get('name') || '组件')
      setSelectionTick((value) => value + 1)
      setRightTab('style')
    })
    instance.on('component:deselected', () => {
      if (isCurrentEditor()) setSelectionTick((value) => value + 1)
    })
    void (async () => {
      let restoredAssets: PackageAsset[] | undefined
      let legacyStyles: Parameters<Editor['setStyle']>[0] | undefined
      let restoredManifestCss = emptyManifestCss()
      const restoredPageCssPaths: Record<string, string> = {}
      try {
        const persisted = await loadPersistedProject()
        if (!isCurrentEditor()) return
        const restoredStates = emptyPageStates()
        if (persisted) {
          restoredAssets = persisted.assets.map((asset) => hydrateAsset(asset))
          const pathToUrl = new Map(restoredAssets.map((asset) => [asset.path, asset.previewUrl]))
          setDraft(persisted.draft)
          resourcesRef.current = persisted.resources
          setResources(persisted.resources)
          assetsRef.current = restoredAssets
          setAssets(restoredAssets)
          setCustomTemplate(sourceTemplateForEditing(persisted.customTemplate))
          setExportMode(persisted.exportMode || DEFAULT_EXPORT_MODE)
          const restoredTargets = new Set<string>()
          if (persisted.pages) {
            for (const [rawTarget, rawState] of Object.entries(persisted.pages)) {
              const target = supportedTarget(rawTarget)
              if (!target || !rawState || typeof rawState.css !== 'string') continue
              const projectData = rawState.projectData
                ? mapProjectAssetUrls(validateStudioProjectData(rawState.projectData), pathToUrl)
                : undefined
              restoredStates[target] = {
                ...rawState,
                css: rawState.css,
                ...(projectData ? { projectData } : {}),
              }
              restoredTargets.add(target)
            }
          }
          if (persisted.cssByPage) {
            restoredManifestCss = {}
            for (const [rawTarget, css] of Object.entries(persisted.cssByPage)) {
              if (typeof css !== 'string') continue
              restoredManifestCss[rawTarget] = css
              const path = persisted.cssPaths?.[rawTarget]
              if (path) restoredPageCssPaths[rawTarget] = path
            }
            // A short app key is a fallback for every known template under that
            // app. Exact keys win, matching phi-plugin's page resolver.
            for (const page of PAGE_DEFINITION_LIST) {
              if (restoredTargets.has(page.target)) continue
              const resolved = resolvePageCss(persisted.cssByPage, page.target)
              if (resolved.css !== undefined) {
                restoredStates[page.target] = { css: resolved.css }
                restoredTargets.add(page.target)
              }
            }
          }
          if (!persisted.pages && !persisted.cssByPage) {
            const safeProject = validateStudioProjectData(persisted.projectData)
            const projectData = mapProjectAssetUrls(safeProject, pathToUrl)
            const restoredCss = projectData.styles
            restoredStates['b19/b19'] = {
              css: '',
              projectData,
            }
            // v1 drafts stored GrapesJS styles in projectData rather than a
            // separate CSS string. Keep that data for the initial load below.
            if (Array.isArray(restoredCss)) legacyStyles = restoredCss
          } else if (!persisted.cssByPage && persisted.pages) {
            restoredManifestCss = Object.fromEntries(
              Object.entries(persisted.pages).map(([target, state]) => [target, state.css]),
            )
          }
        }
        const activeAssets = restoredAssets || []
        pageStatesRef.current = restoredStates
        setPageStates(restoredStates)
        manifestCssRef.current = restoredManifestCss
        setManifestCssByPage(restoredManifestCss)
        pageCssPathsRef.current = restoredPageCssPaths
        setPageCssPaths(restoredPageCssPaths)
        const initialState = restoredStates['b19/b19'] || { css: '' }
        const initialPage = pageForTarget('b19/b19')
        pageTransitionRef.current = true
        try {
          resetEditorDocument(instance, cssForEditorCanvas(cssForPreview(initialState.css || '', activeAssets)), initialPage.markup)
          setCanvasBaseCss(instance, initialPage.pageCssForPreview)
          if (legacyStyles) setEditorStyle(instance, legacyStyles)
          if (initialState.projectData) restoreCustomComponents(instance, initialState.projectData)
          const initialDocument = instance.Canvas.getDocument()
          if (initialDocument) applyRuntimePreview(initialDocument, persisted?.draft || DEFAULT_DRAFT, persisted?.resources || DEFAULT_RESOURCES, activeAssets, previewPageRef.current, previewOptionsRef.current)
        } finally {
          pageTransitionRef.current = false
        }
        restoredAssets = undefined
        activeTargetRef.current = 'b19/b19'
        setActiveTarget('b19/b19')
        instance.Canvas.fitViewport({ gap: 28, zoom: (value) => Math.min(value, 80) })
        setZoom(Math.round(instance.Canvas.getZoom()))
        setSaveState('saved')
      } catch (error) {
        if (restoredAssets) {
          if (assetsRef.current === restoredAssets) {
            assetsRef.current = []
            setAssets([])
          }
          revokeAssets(restoredAssets)
          restoredAssets = undefined
        }
        if (!isCurrentEditor()) return
        const fallbackStates = emptyPageStates()
        pageStatesRef.current = fallbackStates
        setPageStates(fallbackStates)
        const fallbackManifestCss = emptyManifestCss()
        manifestCssRef.current = fallbackManifestCss
        setManifestCssByPage(fallbackManifestCss)
        pageCssPathsRef.current = {}
        setPageCssPaths({})
        activeTargetRef.current = 'b19/b19'
        setActiveTarget('b19/b19')
        setDraft(DEFAULT_DRAFT)
        resourcesRef.current = DEFAULT_RESOURCES
        setResources(DEFAULT_RESOURCES)
        setCustomTemplate('')
        setExportMode(DEFAULT_EXPORT_MODE)
        pageTransitionRef.current = true
        try {
          const fallbackPage = pageForTarget('b19/b19')
          resetEditorDocument(instance, '', fallbackPage.markup)
          setCanvasBaseCss(instance, fallbackPage.pageCssForPreview)
          const fallbackDocument = instance.Canvas.getDocument()
          if (fallbackDocument) applyRuntimePreview(fallbackDocument, DEFAULT_DRAFT, DEFAULT_RESOURCES, [], previewPageRef.current, previewOptionsRef.current)
        } catch {
          // The notification below remains the source error; a frame teardown
          // can make even the fallback reset unavailable during unmount.
        } finally {
          pageTransitionRef.current = false
        }
        notify(`草稿恢复失败：${error instanceof Error ? error.message : String(error)}`, 'error')
        setSaveState('dirty')
      } finally {
        pageTransitionRef.current = false
        if (!isCurrentEditor()) {
          if (restoredAssets) revokeAssets(restoredAssets)
        } else {
          restoredRef.current = true
          setEditor(instance)
          setRevision((value) => value + 1)
        }
      }
    })()
  }, [notify])

  const handleEditorDispose = useCallback((instance: Editor) => {
    if (!editorLifecycleRef.current.dispose(instance)) return
    if (editorInstanceRef.current === instance) editorInstanceRef.current = null
    measuredCanvasTargetRef.current = ''
    lastFittedCanvasKeyRef.current = undefined
    restoredRef.current = false
    if (mountedRef.current) {
      setEditor((current) => current === instance ? null : current)
    }
  }, [])

  useEffect(() => {
    if (!editor || !restoredRef.current || projectResetRef.current || activeTargetRef.current === activeTarget) return
    const previousTarget = activeTargetRef.current
    const previousState = capturePageState(previousTarget)
    const nextState = pageStatesRef.current[activeTarget] || { css: '' }
    try {
      runPageTransition({
        previous: { target: previousTarget, state: previousState },
        next: { target: activeTarget, state: nextState },
        apply: ({ target, state }) => applyPageState(target, state),
      })
      activeTargetRef.current = activeTarget
      setSelectedName(PAGE_LABELS[activeTarget] || activeTarget)
    } catch (error) {
      activeTargetRef.current = previousTarget
      setActiveTarget(previousTarget)
      notify(`页面切换失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }, [activeTarget, applyPageState, capturePageState, editor, notify])

  useEffect(() => {
    if (!editor) return
    try {
      const canvasDocument = editor.Canvas.getDocument()
      if (canvasDocument) {
        if (isB19Target(activeTarget)) {
          applyRuntimePreview(canvasDocument, draft, resources, assets, previewPage, previewOptions)
          editor.trigger('phi:preview:update')
          const selectedElement = editor.getSelected()?.getEl()
          if (selectedElement?.closest('[data-phi-preview-hidden]')) {
            const fallbackSelector = previewPage === 'analysis' ? '.b30-analysis-row' : '.b19'
            const fallback = editor.getWrapper()?.find(fallbackSelector)[0]
            if (fallback) editor.select(fallback)
          }
        } else {
          const userSetting = isUserSettingTarget(activeTarget)
          const height = userSetting
            ? USER_SETTING_VARIANT_HEIGHTS[userSettingVariant]
            : pageForTarget(activeTarget).height
          applySharedRuntimePreview(canvasDocument, draft, resources, assets, height)
          if (userSetting) {
            applyUserSettingVariant(canvasDocument, userSettingVariant)
            editor.trigger('phi:preview:update')
            const selectedElement = editor.getSelected()?.getEl()
            if (selectedElement?.closest('[data-phi-preview-hidden]')) {
              const fallback = editor.getWrapper()?.find('.panel')[0]
              if (fallback) editor.select(fallback)
            }
          }
        }
      }
    } catch {
      // The frame can be between reload states while a project is imported.
    }
  }, [activeTarget, editor, draft, resources, assets, revision, previewPage, previewOptions, userSettingVariant])

  useEffect(() => {
    if (!editor) return
    const definition = pageForTarget(activeTarget)
    const device = editor.Devices.get('phi-1200') || editor.Devices.getSelected()
    const fallback: CanvasSize = {
      width: definition.width,
      height: isB19Target(activeTarget)
      ? PREVIEW_PAGE_HEIGHTS[previewPage]
      : isUserSettingTarget(activeTarget)
        ? USER_SETTING_VARIANT_HEIGHTS[userSettingVariant]
        : definition.height,
    }
    const measurementKey = `${activeTarget}:${isB19Target(activeTarget) ? previewPage : isUserSettingTarget(activeTarget) ? userSettingVariant : ''}`
    const fixedSize = isB19Target(activeTarget) || isUserSettingTarget(activeTarget)
    if (fixedSize || measuredCanvasTargetRef.current !== measurementKey) {
      const height = `${fallback.height}px`
      const width = `${fallback.width}px`
      if (device && (device.get('height') !== height || device.get('width') !== width)) {
        editor.UndoManager.skip(() => device.set({ height, width }))
      }
      setCanvasSize((current) => (
        current.width === fallback.width && current.height === fallback.height ? current : fallback
      ))
    }
    measuredCanvasTargetRef.current = measurementKey
    const shouldFit = lastFittedCanvasKeyRef.current !== measurementKey

    let frame = window.requestAnimationFrame(() => {
      const measured = fixedSize ? fallback : renderedCanvasSize(editor, fallback)
      const height = `${measured.height}px`
      const width = `${measured.width}px`
      if (device && (device.get('height') !== height || device.get('width') !== width)) {
        editor.UndoManager.skip(() => device.set({ height, width }))
      }
      setCanvasSize((current) => (
        current.width === measured.width && current.height === measured.height ? current : measured
      ))
      editor.refresh({ tools: true })
      if (shouldFit && lastFittedCanvasKeyRef.current !== measurementKey) {
        // `applyPageState` runs before this effect updates the device dimensions.
        // Re-fit after the current page size reaches the frame; otherwise a long
        // page inherits the previous page's zoom and its lower half is unreachable.
        editor.Canvas.fitViewport({ gap: 28, zoom: (value) => Math.min(value, 80) })
        lastFittedCanvasKeyRef.current = measurementKey
      }
      frame = window.requestAnimationFrame(() => {
        setZoom(Math.round(editor.Canvas.getZoom()))
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeTarget, editor, previewPage, revision, userSettingVariant])

  useEffect(() => {
    if (!editor || !restoredRef.current || projectResetRef.current) return
    const generation = ++saveGenerationRef.current
    setSaveState('saving')
    const timeout = window.setTimeout(() => {
      if (!mountedRef.current || generation !== saveGenerationRef.current || projectResetRef.current) return
      try {
        const urlToPath = assetUrlMap(assets)
        const currentProjectData = compactProjectData(
          mapProjectAssetUrls(editor.getProjectData(), urlToPath),
        )
        const currentCss = rewriteCssUrls(
          validateThemeCss(cssFromEditorCanvas(
            editor.getCss({ avoidProtected: true, keepUnusedStyles: true }) || '',
          ), urlToPath),
          (url) => urlToPath.get(url) || url,
        )
        const currentPage = {
          ...(pageStatesRef.current[activeTarget] || { css: '' }),
          css: currentCss,
          projectData: currentProjectData,
          dirty: false,
        }
        const pages = { ...pageStatesRef.current, [activeTarget]: currentPage }
        // Persist canonical package paths for every page. Imported v2 page
        // states are hydrated with blob URLs, and only the active editor frame
        // is guaranteed to have been snapshotted during this save cycle.
        const persistedPages = Object.fromEntries(
          Object.entries(pages).map(([target, state]) => [
            target,
            state.projectData
              ? {
                  ...state,
                  projectData: compactProjectData(
                    mapProjectAssetUrls(state.projectData, urlToPath),
                  ),
                }
              : state,
          ]),
        ) as Record<RenderTarget, StudioPageState>
        const persistedManifestCss = pageCssWithEditableStates(manifestCssRef.current, pages)
        const snapshot = {
          schemaVersion: 2 as const,
          draft,
          resources,
          assets: assets.map(({ previewUrl: _previewUrl, ...asset }) => asset),
          customTemplate,
          exportMode,
          projectData: persistedPages['b19/b19']?.projectData || currentProjectData,
          cssByPage: persistedManifestCss,
          cssPaths: pageCssPathsRef.current,
          pages: persistedPages,
        }
        pageStatesRef.current = pages
        manifestCssRef.current = persistedManifestCss
        setManifestCssByPage(persistedManifestCss)
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
      } catch (error) {
        if (!mountedRef.current || generation !== saveGenerationRef.current) return
        setSaveState('dirty')
        notify(`自动保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [activeTarget, editor, draft, resources, assets, customTemplate, exportMode, revision, notify])

  const selection = useMemo(
    () => describeSelection(editor),
    // GrapesJS mutates rules in place, so both counters invalidate this snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, revision, selectionTick],
  )
  const shapeMode = useMemo(
    () => selectedShapeMode(editor),
    // GrapesJS mutates computed styles in place; these counters invalidate the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, revision, selectionTick],
  )
  const statsTableLayout = useMemo(
    () => selectedStatsTableLayout(editor),
    // GrapesJS mutates computed styles in place; these counters invalidate the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, revision, selectionTick],
  )

  const applyShapeMode = (mode: ComponentShapeMode) => {
    if (!editor || !setSelectedShapeMode(editor, mode)) return
    ensurePageCssEntry(activeTargetRef.current)
    setRevision((value) => value + 1)
    setSelectionTick((value) => value + 1)
    setSaveState('dirty')
  }

  const applyStatsTableLayout = (mode: StatsTableLayout) => {
    if (!editor || !setStatsTableLayout(editor, mode)) return
    ensurePageCssEntry(activeTargetRef.current)
    setRevision((value) => value + 1)
    setSelectionTick((value) => value + 1)
    setSaveState('dirty')
  }

  const resetSelectedStyles = () => {
    if (!editor) return
    const cleared = clearSelectedOverrides(editor)
    if (!cleared) return
    ensurePageCssEntry(activeTargetRef.current)
    setRevision((value) => value + 1)
    setSaveState('dirty')
    notify(`已清除 ${selection.name} 的 ${cleared} 项样式覆盖`, 'success')
  }

  const canonical = (() => {
    if (!editor) return { css: '', error: '' }
    try {
      const raw = cssFromEditorCanvas(
        editor.getCss({ avoidProtected: true, keepUnusedStyles: true }) || '',
      )
      const urlToPath = assetUrlMap(assets)
      const checked = validateThemeCss(raw, urlToPath)
      return { css: rewriteCssUrls(checked, (url) => urlToPath.get(url) || url), error: '' }
    } catch (error) {
      return { css: '', error: error instanceof Error ? error.message : String(error) }
    }
  })()
  const canonicalCss = canonical.css
  const projectData = useMemo(() => {
    if (!editor) return undefined
    try {
      return mapProjectAssetUrls(editor.getProjectData(), assetUrlMap(assets))
    } catch {
      return undefined
    }
  // revision invalidates this snapshot after GrapesJS mutates its internal models.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, assets, revision])
  const pageExportStates = useMemo(() => {
    const urlToPath = assetUrlMap(assets)
    const result: Record<RenderTarget, StudioPageState> = {}
    for (const [target, state] of Object.entries(pageStates)) {
      try {
        const checked = validateThemeCss(state.css || '', urlToPath)
        result[target] = {
          ...state,
          css: rewriteCssUrls(checked, (url) => urlToPath.get(url) || url),
          ...(state.projectData ? { projectData: mapProjectAssetUrls(state.projectData, urlToPath) } : {}),
        }
      } catch {
        result[target] = state
      }
    }
    if (activeTarget && projectData) {
      result[activeTarget] = {
        ...(result[activeTarget] || { css: '' }),
        css: canonicalCss,
        projectData,
      }
    }
    return result
  }, [activeTarget, assets, canonicalCss, pageStates, projectData])
  const exportCssByPage = useMemo(
    () => pageCssWithEditableStates(manifestCssByPage, pageExportStates),
    [manifestCssByPage, pageExportStates],
  )
  const exportPages = useMemo(() => Object.fromEntries(
    Object.entries(pageExportStates).filter(([target]) => (
      Boolean(pageForTarget(target).capabilities.customElements) &&
      resolvePageCss(exportCssByPage, target).css !== undefined
    )),
  ) as Record<RenderTarget, StudioPageState>, [exportCssByPage, pageExportStates])
  const b19ProjectData = pageExportStates['b19/b19']?.projectData
  const effectiveTemplateResult = useMemo(() => {
    if (!b19ProjectData) return { template: customTemplate, error: '' }
    try {
      return {
        template: templateForProject(customTemplate, b19ProjectData, new Set(assets.map((asset) => asset.path))),
        error: '',
      }
    } catch (error) {
      return {
        template: customTemplate,
        error: `生成 b19.art 失败：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }, [customTemplate, b19ProjectData, assets])
  const effectiveTemplate = effectiveTemplateResult.template
  const exportInput = useMemo(() => ({
    draft,
    resources,
    assets,
    css: resolvePageCss(exportCssByPage, 'b19/b19').css || canonicalCss,
    cssByPage: exportCssByPage,
    pages: exportPages,
    cssPaths: pageCssPathsForExport(exportCssByPage, pageCssPaths),
    exportMode,
    customTemplate: effectiveTemplate,
  }), [draft, resources, assets, canonicalCss, exportCssByPage, exportMode, exportPages, effectiveTemplate, pageCssPaths])
  const issues = useMemo(() => {
    const result = validateTheme(exportInput)
    const derivedErrors = [canonical.error, effectiveTemplateResult.error]
      .filter(Boolean)
      .map((message) => ({ level: 'error' as const, message }))
    return [...derivedErrors, ...result]
  }, [exportInput, canonical.error, effectiveTemplateResult.error])
  const yaml = useMemo(() => manifestYaml(exportInput), [exportInput])
  const assetBytes = useMemo(() => assets.reduce((total, asset) => total + asset.bytes.byteLength, 0), [assets])

  const updateZoom = (value: number) => {
    if (!editor) return
    const next = Math.max(20, Math.min(MAX_CANVAS_ZOOM, Math.round(value)))
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
    if (target.kind === 'background') return resourcesRef.current.background
    if (target.kind === 'font') return resourcesRef.current.font
    return resourcesRef.current.icons[target.rating]
  }

  const preparePageAssetState = () => {
    const currentTarget = activeTargetRef.current
    const statesWithCurrent = {
      ...pageStatesRef.current,
      [currentTarget]: snapshotPageState(currentTarget, editor),
    }
    const urlToPath = assetUrlMap(assetsRef.current)
    return {
      states: rewritePageAssetReferences(statesWithCurrent, urlToPath),
      manifestCss: rewriteCssMapAssetReferences(manifestCssRef.current, urlToPath),
    }
  }

  const applyAssetStateChange = (options: {
    previousStates: Record<RenderTarget, StudioPageState>
    nextStates: Record<RenderTarget, StudioPageState>
    previousManifestCss: PageCssMap
    nextManifestCss: PageCssMap
    previousAssets: PackageAsset[]
    nextAssets: PackageAsset[]
    previousResources: ThemeResources
    nextResources: ThemeResources
    removedAssets: PackageAsset[]
    createdAssets?: PackageAsset[]
  }) => {
    const currentTarget = activeTargetRef.current
    assetsRef.current = options.nextAssets
    resourcesRef.current = options.nextResources
    try {
      applyPageState(currentTarget, options.nextStates[currentTarget] || { css: '' }, editor)
    } catch (error) {
      assetsRef.current = options.previousAssets
      resourcesRef.current = options.previousResources
      pageStatesRef.current = options.previousStates
      manifestCssRef.current = options.previousManifestCss
      setPageStates(options.previousStates)
      setManifestCssByPage(options.previousManifestCss)
      try {
        applyPageState(currentTarget, options.previousStates[currentTarget] || { css: '' }, editor)
      } catch {
        // Keep the original asset-application failure as the user-facing error.
      }
      revokeAssets(options.createdAssets || [])
      notify(`资源更新失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      return false
    }

    pageStatesRef.current = options.nextStates
    manifestCssRef.current = options.nextManifestCss
    setPageStates(options.nextStates)
    setManifestCssByPage(options.nextManifestCss)
    setAssets(options.nextAssets)
    setResources(options.nextResources)
    window.setTimeout(() => revokeAssets(options.removedAssets), 0)
    setSaveState('dirty')
    return true
  }

  const uploadAsset = async (target: UploadTarget, file: File) => {
    if (!editor || projectResetRef.current) return
    if (file.size > MAX_UPLOAD_BYTES) {
      notify('单个资源不能超过 20 MB', 'error')
      return
    }
    const extension = extensionOf(file.name)
    const allowed = target.kind === 'font'
      ? ['ttf', 'otf', 'woff', 'woff2'].includes(extension)
      : IMAGE_EXTENSIONS.has(extension)
    if (!allowed) {
      notify('文件类型不受支持', 'error')
      return
    }
    const path = targetPath(target, file)
    const previousPath = currentTargetPath(target)
    let nextAsset: PackageAsset | undefined
    try {
      nextAsset = await assetFromFile(file, path)
      const previousAssets = assetsRef.current
      const previousResources = resourcesRef.current
      const prepared = preparePageAssetState()
      const migration = new Map<string, string>()
      if (previousPath && previousPath !== path) {
        migration.set(previousPath, path)
        migration.set(`./${previousPath}`, path)
      }
      const nextStates = migration.size
        ? rewritePageAssetReferences(prepared.states, migration)
        : prepared.states
      const nextManifestCss = migration.size
        ? rewriteCssMapAssetReferences(prepared.manifestCss, migration)
        : prepared.manifestCss
      const removedAssets = previousAssets.filter((asset) => asset.path === previousPath || asset.path === path)
      const nextAssets = [
        ...previousAssets.filter((asset) => asset.path !== previousPath && asset.path !== path),
        nextAsset,
      ]
      const applied = applyAssetStateChange({
        previousStates: prepared.states,
        nextStates,
        previousManifestCss: prepared.manifestCss,
        nextManifestCss,
        previousAssets,
        nextAssets,
        previousResources,
        nextResources: resourcesWithTarget(previousResources, target, path),
        removedAssets,
        createdAssets: [nextAsset],
      })
      if (applied) notify(`${file.name} 已加入主题包`, 'success')
    } catch (error) {
      if (nextAsset) revokeAssets([nextAsset])
      notify(`资源更新失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const removeAsset = (target: UploadTarget) => {
    if (!editor || projectResetRef.current) return
    const path = currentTargetPath(target)
    if (!path) return
    try {
      const previousAssets = assetsRef.current
      const previousResources = resourcesRef.current
      const prepared = preparePageAssetState()
      if (
        pageStatesReferenceAsset(prepared.states, path) ||
        cssMapReferencesAsset(prepared.manifestCss, path)
      ) {
        notify('该资源仍被页面样式或自定义元素引用，请先移除对应引用', 'error')
        return
      }
      const applied = applyAssetStateChange({
        previousStates: prepared.states,
        nextStates: prepared.states,
        previousManifestCss: prepared.manifestCss,
        nextManifestCss: prepared.manifestCss,
        previousAssets,
        nextAssets: previousAssets.filter((asset) => asset.path !== path),
        previousResources,
        nextResources: resourcesWithTarget(previousResources, target),
        removedAssets: previousAssets.filter((asset) => asset.path === path),
      })
      if (applied) notify('已恢复插件内置资源', 'success')
    } catch (error) {
      notify(`资源移除失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const importPackage = async (file: File) => {
    if (!editor || projectResetRef.current) return
    const generation = ++importGenerationRef.current
    saveGenerationRef.current++
    type ImportedPackage = Awaited<ReturnType<typeof importThemePackage>>
    type StagedImport = {
      previousAssets: PackageAsset[]
      previousTarget: RenderTarget
      previousState: StudioPageState
      wasPreviewing: boolean
      nextStates: Record<RenderTarget, StudioPageState>
      nextManifestCss: PageCssMap
      nextPageCssPaths: Record<string, string>
      b19State: StudioPageState
      template: string
      warnings: string[]
    }
    let staged: StagedImport | undefined
    try {
      const committed = await runImportTransaction<ImportedPackage>({
        load: () => importThemePackage(file),
        isCurrent: () => mountedRef.current && generation === importGenerationRef.current,
        apply: (next) => {
          const previousTarget = activeTargetRef.current
          const previousState = snapshotPageState(previousTarget, editor)
          const previousAssets = assetsRef.current
          const nextStates: Record<RenderTarget, StudioPageState> = {}
          const nextManifestCss = { ...next.cssByPage }
          const nextPageCssPaths = pageCssPathsFromMetadata(next.pageCssMetadata)
          const importedTargets = new Set<string>()
          for (const [rawTarget, state] of Object.entries(next.pages || {})) {
            const target = supportedTarget(rawTarget)
            if (target) {
              nextStates[target] = { ...state }
              importedTargets.add(target)
            }
          }
          // Resolve each known page independently so short app keys fan out to
          // all templates and exact app/template keys take precedence.
          for (const page of PAGE_DEFINITION_LIST) {
            if (importedTargets.has(page.target)) continue
            const resolved = resolvePageCss(next.cssByPage, page.target)
            if (resolved.css !== undefined) nextStates[page.target] = { css: resolved.css }
          }
          if (next.projectData && !nextStates['b19/b19']?.projectData) {
            nextStates['b19/b19'] = { ...nextStates['b19/b19'], projectData: next.projectData }
          }
          const b19State = nextStates['b19/b19'] || { css: next.css }
          const wasPreviewing = previewMode
          staged = {
            previousAssets,
            previousTarget,
            previousState,
            wasPreviewing,
            nextStates,
            nextManifestCss,
            nextPageCssPaths,
            b19State,
            template: sourceTemplateForEditing(next.customTemplate, Boolean(next.projectData)),
            warnings: next.warnings,
          }

          if (wasPreviewing) editor.stopCommand('preview')
          // Always use the latest fixed preview DOM. Runtime CSS is the package source of truth.
          pageTransitionRef.current = true
          try {
            resetEditorDocument(editor, cssForEditorCanvas(cssForPreview(b19State.css || next.css, next.assets)), pageForTarget('b19/b19').markup)
            setCanvasBaseCss(editor, pageForTarget('b19/b19').pageCssForPreview)
            if (b19State.projectData) restoreCustomComponents(editor, b19State.projectData)
            const importedDocument = editor.Canvas.getDocument()
            if (importedDocument) applyRuntimePreview(importedDocument, next.draft, next.resources, next.assets, previewPage, previewOptions)
          } finally {
            pageTransitionRef.current = false
          }
        },
        rollback: () => {
          if (!staged) return
          try {
            applyPageState(staged.previousTarget, staged.previousState, editor)
          } finally {
            if (staged.wasPreviewing) editor.runCommand('preview')
          }
        },
        commit: (next) => {
          if (!staged) throw new Error('导入事务未完成暂存')
          pageStatesRef.current = staged.nextStates
          setPageStates(staged.nextStates)
          manifestCssRef.current = staged.nextManifestCss
          setManifestCssByPage(staged.nextManifestCss)
          pageCssPathsRef.current = staged.nextPageCssPaths
          setPageCssPaths(staged.nextPageCssPaths)
          activeTargetRef.current = 'b19/b19'
          setActiveTarget('b19/b19')
          if (staged.wasPreviewing) setPreviewMode(false)
          setDraft(next.draft)
          resourcesRef.current = next.resources
          setResources(next.resources)
          assetsRef.current = next.assets
          setAssets(next.assets)
          setCustomTemplate(staged.template)
          setExportMode(next.exportMode)
          const previousAssets = staged.previousAssets
          window.setTimeout(() => revokeAssets(previousAssets), 0)
          setRevision((value) => value + 1)
          setSaveState('dirty')
          setSelectedName('成绩卡')
        },
        discard: (next) => revokeAssets(next.assets),
      })
      if (!committed) return
      if (staged) {
        try {
          fitCanvas()
        } catch {
          // The editor may be replaced immediately after a successful commit.
        }
        const unsupportedCount = Object.keys(staged.nextManifestCss)
          .filter((target) => !supportedTarget(target)).length
        const passthroughNote = unsupportedCount ? `；已保留 ${unsupportedCount} 个未支持页面样式` : ''
        const warningSuffix = staged.warnings.length ? `；${staged.warnings.join('；')}` : ''
        notify(`已导入 ${file.name}${warningSuffix}${passthroughNote}`, staged.warnings.length ? 'info' : 'success')
      }
    } catch (error) {
      notify(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const createNew = async () => {
    if (!editor || projectResetRef.current) return
    if ((saveState === 'dirty' || saveState === 'saving') && !window.confirm('当前改动尚未自动保存，仍要新建主题吗？')) return
    const generation = ++importGenerationRef.current
    saveGenerationRef.current++
    projectResetRef.current = true
    setSaveState('saving')
    let staged: {
      previousAssets: PackageAsset[]
      previousTarget: RenderTarget
      previousState: StudioPageState
      wasPreviewing: boolean
    } | undefined
    try {
      const committed = await runProjectResetTransaction({
        drain: async () => {
          await saveQueueRef.current.catch(() => undefined)
        },
        isCurrent: () => mountedRef.current && generation === importGenerationRef.current,
        apply: () => {
          const previousTarget = activeTargetRef.current
          staged = {
            previousAssets: assetsRef.current,
            previousTarget,
            previousState: snapshotPageState(previousTarget, editor),
            wasPreviewing: previewMode,
          }
          if (staged.wasPreviewing) editor.stopCommand('preview')
          pageTransitionRef.current = true
          try {
            const page = pageForTarget('b19/b19')
            resetEditorDocument(editor, '', page.markup)
            setCanvasBaseCss(editor, page.pageCssForPreview)
            const canvasDocument = editor.Canvas.getDocument()
            if (canvasDocument) {
              applyRuntimePreview(
                canvasDocument,
                DEFAULT_DRAFT,
                DEFAULT_RESOURCES,
                [],
                previewPageRef.current,
                previewOptionsRef.current,
              )
            }
          } finally {
            pageTransitionRef.current = false
          }
        },
        clear: () => {
          const clearing = clearPersistedProject()
          saveQueueRef.current = clearing
          return clearing
        },
        commit: () => {
          if (!staged) throw new Error('新建事务未完成暂存')
          const blankStates = emptyPageStates()
          pageStatesRef.current = blankStates
          setPageStates(blankStates)
          const blankManifestCss = emptyManifestCss()
          manifestCssRef.current = blankManifestCss
          setManifestCssByPage(blankManifestCss)
          pageCssPathsRef.current = {}
          setPageCssPaths({})
          activeTargetRef.current = 'b19/b19'
          setActiveTarget('b19/b19')
          assetsRef.current = []
          setDraft(DEFAULT_DRAFT)
          resourcesRef.current = DEFAULT_RESOURCES
          setResources(DEFAULT_RESOURCES)
          setAssets([])
          setCustomTemplate('')
          setExportMode(DEFAULT_EXPORT_MODE)
          if (staged.wasPreviewing) setPreviewMode(false)
          setRevision((value) => value + 1)
          setSaveState('dirty')
          setSelectedName('成绩卡')
        },
        rollback: () => {
          if (!staged) return
          activeTargetRef.current = staged.previousTarget
          setActiveTarget(staged.previousTarget)
          try {
            applyPageState(staged.previousTarget, staged.previousState, editor)
          } finally {
            if (staged.wasPreviewing) editor.runCommand('preview')
          }
        },
      })
      if (!committed || !staged) return
      window.setTimeout(() => revokeAssets(staged?.previousAssets || []), 0)
      notify('已创建空白主题', 'success')
    } catch (error) {
      setRevision((value) => value + 1)
      setSaveState('dirty')
      notify(`新建失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      projectResetRef.current = false
    }
  }

  const exportPackage = async () => {
    if (!editor) return
    try {
      const projectData = b19ProjectData || mapProjectAssetUrls(editor.getProjectData(), assetUrlMap(assets))
      const generatedTemplate = templateForProject(customTemplate, projectData, new Set(assets.map((asset) => asset.path)))
      const blob = await exportThemePackage({
        ...exportInput,
        customTemplate: generatedTemplate,
        templateSource: customTemplate,
        projectData,
      })
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
    const checked = validateThemeCss(css, assetUrlMap(assets))
    setEditorStyle(editor, cssForEditorCanvas(cssForPreview(css, assets)))
    const canonicalSourceCss = rewriteCssUrls(checked, (url) => assetUrlMap(assets).get(url) || url)
    const target = activeTargetRef.current
    ensurePageCssEntry(target, canonicalSourceCss)
    const current = pageStatesRef.current[target] || { css: '' }
    const nextStates = {
      ...pageStatesRef.current,
      [target]: { ...current, css: canonicalSourceCss, dirty: true },
    }
    pageStatesRef.current = nextStates
    setPageStates(nextStates)
    if (isB19Target(target)) setCustomTemplate(template)
    setRevision((value) => value + 1)
    setSaveState('dirty')
  }

  const addCustomElement = (kind: CustomElementKind, src?: string) => {
    if (!editor || !pageForTarget(activeTargetRef.current).capabilities.customElements) {
      notify('当前页面由插件模板提供结构，只能编辑样式覆盖', 'info')
      return
    }
    appendCustomComponent(editor, {
      kind,
      src,
      name: `自定义${CUSTOM_ELEMENT_LABELS[kind]}`,
    })
    ensurePageCssEntry(activeTargetRef.current)
    setSelectedName(`自定义${CUSTOM_ELEMENT_LABELS[kind]}`)
    setRevision((value) => value + 1)
    setSaveState('dirty')
    notify(`已添加${CUSTOM_ELEMENT_LABELS[kind]}元素`, 'success')
  }

  const handleCustomImage = async (file: File) => {
    if (!editor || !pageForTarget(activeTargetRef.current).capabilities.customElements) return
    if (file.size > MAX_UPLOAD_BYTES) {
      notify('单个资源不能超过 20 MB', 'error')
      return
    }
    if (!isSupportedImage(file)) {
      notify('仅支持 PNG、JPEG、WebP、GIF 或 AVIF 图片', 'error')
      return
    }
    const path = `assets/custom/${normalizedAssetName(file.name, `image-${Date.now()}`)}`
    const asset = await assetFromFile(file, path)
    setAssets((current) => {
      const next = [...current, asset]
      assetsRef.current = next
      return next
    })
    addCustomElement('image', asset.previewUrl)
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
          <button type="button" className="icon-button" title="放大" disabled={zoom >= MAX_CANVAS_ZOOM} onClick={() => updateZoom(zoom + 10)}><ZoomIn size={17} /></button>
          <button type="button" className="icon-button" title="适应画布" onClick={fitCanvas}><Scan size={17} /></button>
          <span className="toolbar-divider" />
          <button type="button" className={`icon-button ${previewMode ? 'active' : ''}`} title={previewMode ? '退出预览' : '预览'} onClick={togglePreview}>
            {previewMode ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button type="button" className="icon-button" title="主题源码" onClick={() => setSourceOpen(true)}><Code2 size={17} /></button>
          <button type="button" className="icon-button" title="使用指南" onClick={() => guide.setOpen(true)}><CircleHelp size={17} /></button>
          <a
            className="icon-button"
            href="https://github.com/lyh2011/phi-theme-studio"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub 仓库"
            aria-label="GitHub 仓库"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.73c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
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
          <input ref={customImageInputRef} type="file" accept="image/*" hidden onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleCustomImage(file)
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
            <ComponentNavigator
              editor={editor}
              page={isB19Target(activeTarget) ? previewPage : activeTarget}
              previewOptions={previewOptions}
              customElementsEnabled={pageForTarget(activeTarget).capabilities.customElements}
              onSelect={(label) => {
                setSelectedName(label)
                setRightTab('style')
                setMobilePanel('right')
              }}
              onAddCustom={(kind) => addCustomElement(kind)}
              onUploadCustomImage={() => customImageInputRef.current?.click()}
            />
          </div>
          <div className={`sidebar-content manager-content ${leftTab === 'layers' ? 'active' : ''}`} id="gjs-layer-manager" />
        </aside>

        <section className="canvas-column">
          <div className="canvas-viewbar">
            <div className="page-segmented" role="tablist" aria-label="编辑页面">
              {PAGE_DEFINITION_LIST.map((page) => (
                <button
                  key={page.target}
                  type="button"
                  role="tab"
                  aria-selected={activeTarget === page.target}
                  className={activeTarget === page.target ? 'active' : ''}
                  onClick={() => setActiveTarget(page.target)}
                >
                  {PAGE_LABELS[page.target]}
                </button>
              ))}
            </div>
            {isB19Target(activeTarget) && (
              <div className="preview-subbar">
                <div className="preview-segmented" role="tablist" aria-label="B19 预览状态">
                  {PREVIEW_PAGES.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      role="tab"
                      aria-selected={previewPage === page.id}
                      className={previewPage === page.id ? 'active' : ''}
                      onClick={() => setPreviewPage(page.id)}
                    >
                      {PREVIEW_PAGE_LABELS[page.id]}
                    </button>
                  ))}
                </div>
                <PreviewOptionsMenu
                  options={previewOptions}
                  onChange={(option: PreviewOption, enabled: boolean) => setPreviewOptions((current) => ({ ...current, [option]: enabled }))}
                />
              </div>
            )}
            {isUserSettingTarget(activeTarget) && (
              <div className="preview-subbar">
                <div className="preview-segmented" role="tablist" aria-label="用户设置预览状态">
                  {USER_SETTING_VARIANTS.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      role="tab"
                      aria-selected={userSettingVariant === variant.id}
                      className={userSettingVariant === variant.id ? 'active' : ''}
                      onClick={() => setUserSettingVariant(variant.id)}
                    >
                      {variant.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <span className="preview-dimensions">{canvasSize.width} x {canvasSize.height}</span>
          </div>
          <div className="canvas-stage">
            <GrapesCanvas
              onReady={handleEditorReady}
              onDispose={handleEditorDispose}
              onUpdate={handleEditorUpdate}
              onZoomChange={setZoom}
              onAssetUpload={uploadEditorAssets}
              components={pageForTarget('b19/b19').markup}
              protectedCss=""
            />
          </div>
          <footer className="canvas-statusbar">
            <span><Check size={13} />{PAGE_LABELS[activeTarget]}{isB19Target(activeTarget) ? ` · ${PREVIEW_PAGE_LABELS[previewPage]}` : isUserSettingTarget(activeTarget) ? ` · ${USER_SETTING_VARIANTS.find((variant) => variant.id === userSettingVariant)?.label}` : ''}</span>
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
            <div className="inspector-heading">
              <div className="inspector-heading-name">
                <span>当前组件</span>
                <strong>{selection.name}</strong>
              </div>
              <nav className="selection-path" aria-label="元素层级">
                {selection.ancestors.map((ancestor) => (
                  <button
                    key={ancestor.id}
                    type="button"
                    title={`选择上层元素 ${ancestor.name}（${ancestor.selector}）`}
                    onClick={() => {
                      if (editor && selectAncestor(editor, ancestor.id)) setSelectedName(ancestor.name)
                    }}
                  >
                    {ancestor.selector}
                  </button>
                ))}
                <code title={selection.selector ? `导出规则选择器 ${selection.selector}` : '该元素不会生成导出规则'}>
                  {selection.selector || '不可导出'}
                </code>
              </nav>
              <button
                type="button"
                className="override-reset"
                disabled={!selection.overrides}
                title={selection.overrides ? `清除 ${selection.overrides} 项样式覆盖` : '当前元素没有样式覆盖'}
                onClick={resetSelectedStyles}
              >
                <RotateCcw size={12} />
                {selection.overrides ? `${selection.overrides} 项覆盖` : '无覆盖'}
              </button>
            </div>
            {(shapeMode || statsTableLayout) && (
              <div className="component-mode-controls">
                {shapeMode && (
                  <div className="component-mode-row">
                    <span>形状</span>
                    <div className="component-mode-segments" role="group" aria-label={`${selection.name}形状`}>
                      <button
                        type="button"
                        className={shapeMode.mode === 'parallelogram' ? 'active' : ''}
                        aria-pressed={shapeMode.mode === 'parallelogram'}
                        onClick={() => applyShapeMode('parallelogram')}
                      >
                        <span className="shape-mode-glyph is-slanted" aria-hidden="true" />
                        {shapeMode.slantedLabel}
                      </button>
                      <button
                        type="button"
                        className={shapeMode.mode === 'rectangle' ? 'active' : ''}
                        aria-pressed={shapeMode.mode === 'rectangle'}
                        onClick={() => applyShapeMode('rectangle')}
                      >
                        <span className="shape-mode-glyph" aria-hidden="true" />
                        长方形
                      </button>
                    </div>
                  </div>
                )}
                {statsTableLayout && (
                  <div className="component-mode-row">
                    <span>表格排布</span>
                    <div className="component-mode-segments" role="group" aria-label="成绩统计表排布">
                      <button
                        type="button"
                        className={statsTableLayout === 'slanted' ? 'active' : ''}
                        aria-pressed={statsTableLayout === 'slanted'}
                        onClick={() => applyStatsTableLayout('slanted')}
                      >斜排</button>
                      <button
                        type="button"
                        className={statsTableLayout === 'orthogonal' ? 'active' : ''}
                        aria-pressed={statsTableLayout === 'orthogonal'}
                        onClick={() => applyStatsTableLayout('orthogonal')}
                      >对齐</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div id="gjs-style-manager" />
            <div id="gjs-trait-manager" />
          </div>
          <div className={`inspector-content ${rightTab === 'theme' ? 'active' : ''}`}><ThemeForm draft={draft} setDraft={setDraft} /></div>
          <div className={`inspector-content ${rightTab === 'assets' ? 'active' : ''}`}><AssetForm resources={resources} assets={assets} onUpload={(target, file) => void uploadAsset(target, file)} onRemove={removeAsset} /></div>
          <div className={`inspector-content ${rightTab === 'package' ? 'active' : ''}`}>
            <PackagePanel
              issues={issues}
              assetCount={assets.length}
              customTemplate={Boolean(effectiveTemplate.trim())}
              exportMode={exportMode}
              onExportModeChange={(mode) => {
                setExportMode(mode)
                setSaveState('dirty')
              }}
              onSource={() => setSourceOpen(true)}
              onExport={exportPackage}
            />
          </div>
        </aside>
      </main>

      <SourceDialog
        open={sourceOpen}
        css={pageExportStates[activeTarget]?.css || canonicalCss}
        template={isB19Target(activeTarget) ? customTemplate : ''}
        cssLabel={pageCssPathForTarget(exportCssByPage, pageCssPaths, activeTarget)}
        templateEditable={pageForTarget(activeTarget).capabilities.templateEditable}
        yaml={yaml}
        onClose={() => setSourceOpen(false)}
        onApply={applySource}
      />
      <HelpDialog open={guide.open} onClose={guide.close} />
      {toast && <div className={`toast is-${toast.kind}`} role="status"><FileArchive size={16} />{toast.message}</div>}
    </div>
  )
}

export default App
