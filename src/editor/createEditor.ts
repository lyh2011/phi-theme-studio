import grapesjs, {
  type Component,
  type ComponentDragEventData,
  type Editor,
  type StyleProps,
} from 'grapesjs'
import { PREVIEW_MARKUP, PROTECTED_CSS } from './preview'

interface CreateEditorOptions {
  container: HTMLElement
  layers: HTMLElement
  styles: HTMLElement
  traits: HTMLElement
  onReady: (editor: Editor) => void
  onUpdate: () => void
}

interface ActiveDrag {
  component: Component
  selector: string
  startX: number
  startY: number
  undoWasTracking: boolean
}

interface ActiveResize {
  component: Component
  selector: string
  style: StyleProps
  temporaryTarget: ReturnType<Editor['Styles']['getModelToStyle']>
  temporaryStyle: StyleProps
  componentStyle: StyleProps
  stableTarget: ReturnType<Editor['Css']['getRule']>
  stableStyle: StyleProps
  undoWasTracking: boolean
}

export const PHI_COMPONENT_DRAG_TYPE = 'application/x-phi-theme-component'

export function createShiftAwareSnapGuides(defaults: { x?: number; y?: number } = {}) {
  const fallback = { x: defaults.x ?? 5, y: defaults.y ?? 5 }
  const guides = { ...fallback }
  return {
    guides,
    update(shiftKey: boolean) {
      guides.x = shiftKey ? 0 : fallback.x
      guides.y = shiftKey ? 0 : fallback.y
    },
  }
}

// Runtime selectors are deliberately limited to class-backed descendants. This
// keeps exported rules stable while allowing fine-grained targets such as
// `.Challenge img` and `.playerId p`.
const RUNTIME_SELECTOR_RE = /^(?:\.[A-Za-z_][\w-]*|[A-Za-z][\w-]*)(?:(?:\s+)(?:\.[A-Za-z_][\w-]*|[A-Za-z][\w-]*))*$/

export function getRuntimeSelector(component: Component | undefined) {
  const value = component?.getAttributes()['data-phi-selector']
  return typeof value === 'string' && RUNTIME_SELECTOR_RE.test(value) ? value : ''
}

function lockComponent(component: Component) {
  const runtimeSelector = getRuntimeSelector(component)
  const customKind = component.getAttributes()['data-phi-custom']
  const isCustom = typeof customKind === 'string' && customKind.length > 0
  component.set({
    // Translate mode changes visual position only; the runtime template structure stays fixed.
    draggable: Boolean(runtimeSelector) || isCustom,
    droppable: false,
    removable: isCustom,
    copyable: isCustom,
    editable: isCustom && customKind === 'text',
    selectable: Boolean(runtimeSelector) || isCustom,
    hoverable: Boolean(runtimeSelector) || isCustom,
    stylable: Boolean(runtimeSelector) || isCustom,
    resizable: Boolean(runtimeSelector) || isCustom,
  })
  component.components().forEach(lockComponent)
}

export function lockEditorDocument(editor: Editor) {
  const wrapper = editor.getWrapper()
  if (wrapper) lockComponent(wrapper)
  editor.setDragMode('translate')
}

function isVisible(component: Component) {
  const element = component.getEl()
  return Boolean(element && !element.closest('[data-phi-preview-hidden]'))
}

export function findVisibleRuntimeComponent(editor: Editor, selector: string) {
  return editor.getWrapper()?.find(selector).find(isVisible)
}

function selectRuntimeStyle(editor: Editor, component: Component | undefined) {
  const selector = getRuntimeSelector(component)
  if (!component || !selector) return
  let rule = editor.Css.getRule(selector)
  if (!rule) editor.UndoManager.skip(() => { rule = editor.Css.setRule(selector) })
  if (!rule) return
  if (editor.Styles.getSelected() !== rule) editor.Styles.select(rule, { component })
}

function pixelPair(value: unknown): [number, number] {
  if (typeof value !== 'string' || value === 'none') return [0, 0]
  const parts = value.trim().split(/\s+/)
  const x = Number.parseFloat(parts[0])
  const y = Number.parseFloat(parts[1] || parts[0])
  return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0]
}

function transformTranslate(value: unknown, axis: 'X' | 'Y') {
  if (typeof value !== 'string') return 0
  const matches = [...value.matchAll(new RegExp(`translate${axis}\\((-?\\d+(?:\\.\\d+)?)px\\)`, 'g'))]
  const parsed = Number.parseFloat(matches.at(-1)?.[1] || '0')
  return Number.isFinite(parsed) ? parsed : 0
}

function currentTranslate(component: Component): [number, number] {
  const element = component.getEl()
  const view = element?.ownerDocument.defaultView
  if (!element || !view) return [0, 0]
  const style = view.getComputedStyle(element)
  const individual = pixelPair(style.translate)
  if (individual[0] || individual[1]) return individual
  const transform = style.transform
  const functionMatches = [...transform.matchAll(/translate(?:3d)?\(\s*(-?[\d.]+)px(?:\s*,?\s*)(-?[\d.]+)px(?:[^)]*)\)/g)]
  const last = functionMatches.at(-1)
  if (last) return [Number(last[1]) || 0, Number(last[2]) || 0]
  const matrix = transform.match(/^matrix(?:3d)?\(([^)]+)\)$/)
  if (matrix) {
    const values = matrix[1].split(',').map(Number)
    return values.length === 16 ? [values[12] || 0, values[13] || 0] : [values[4] || 0, values[5] || 0]
  }
  return [0, 0]
}

function cleanNumber(value: number) {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

export function moveRuntimeComponent(editor: Editor, component: Component, deltaX: number, deltaY: number) {
  const selector = getRuntimeSelector(component)
  if (!selector) return
  const [currentX, currentY] = currentTranslate(component)
  const x = cleanNumber(currentX + deltaX)
  const y = cleanNumber(currentY + deltaY)
  let rule = editor.Css.getRule(selector)
  if (!rule) editor.UndoManager.skip(() => { rule = editor.Css.setRule(selector) })
  if (!rule) return
  rule.addStyle({ translate: `${x}px ${y}px` })
  editor.select(component)
  selectRuntimeStyle(editor, component)
}

function installCanvasPan(editor: Editor) {
  const canvasElement = editor.Canvas.getElement()
  const frameElement = editor.Canvas.getFrameEl()
  const frameDocument = editor.Canvas.getDocument()
  const frameWindow = frameDocument?.defaultView
  if (!canvasElement || !frameElement || !frameDocument || canvasElement.dataset.phiPanReady) return
  canvasElement.dataset.phiPanReady = 'true'

  let active = false
  let lastX = 0
  let lastY = 0
  let pointerId: number | undefined
  const screenPoint = (event: PointerEvent | MouseEvent) => {
    const sourceWindow = (event.target as Node | null)?.ownerDocument?.defaultView
    const frameRect = frameElement.getBoundingClientRect()
    const zoom = editor.Canvas.getZoom() / 100 || 1
    return sourceWindow === frameWindow
      ? { x: event.clientX * zoom + frameRect.left, y: event.clientY * zoom + frameRect.top }
      : { x: event.clientX, y: event.clientY }
  }

  const stop = () => {
    if (!active) return
    active = false
    pointerId = undefined
    canvasElement.classList.remove('phi-is-panning')
    for (const target of [window, frameWindow].filter(Boolean)) {
      target?.removeEventListener('pointermove', move)
      target?.removeEventListener('pointerup', stop)
      target?.removeEventListener('pointercancel', stop)
    }
  }
  const move = (event: PointerEvent) => {
    if ('_parentEvent' in event) return
    if (!active || pointerId !== undefined && event.pointerId !== pointerId) return
    const point = screenPoint(event)
    const coords = editor.Canvas.getCoords()
    editor.Canvas.setCoords(coords.x + point.x - lastX, coords.y + point.y - lastY)
    lastX = point.x
    lastY = point.y
    event.preventDefault()
  }
  const start = (event: MouseEvent | PointerEvent) => {
    if ('_parentEvent' in event) return
    if (event.button !== 2 || active) return
    const point = screenPoint(event)
    active = true
    lastX = point.x
    lastY = point.y
    pointerId = 'pointerId' in event ? event.pointerId : undefined
    canvasElement.classList.add('phi-is-panning')
    event.preventDefault()
    for (const target of [window, frameWindow].filter(Boolean)) {
      target?.addEventListener('pointermove', move, { passive: false })
      target?.addEventListener('pointerup', stop)
      target?.addEventListener('pointercancel', stop)
    }
  }
  const contextMenu = (event: MouseEvent) => event.preventDefault()
  canvasElement.addEventListener('pointerdown', start as EventListener, { capture: true })
  frameDocument.addEventListener('pointerdown', start as EventListener, { capture: true })
  canvasElement.addEventListener('contextmenu', contextMenu)
  frameDocument.addEventListener('contextmenu', contextMenu)
  editor.on('destroy', () => {
    stop()
    canvasElement.removeEventListener('pointerdown', start as EventListener, true)
    frameDocument.removeEventListener('pointerdown', start as EventListener, true)
    canvasElement.removeEventListener('contextmenu', contextMenu)
    frameDocument.removeEventListener('contextmenu', contextMenu)
  })
}

function installCanvasDrop(editor: Editor) {
  const document = editor.Canvas.getDocument()
  if (!document || document.documentElement.dataset.phiDropReady) return
  document.documentElement.dataset.phiDropReady = 'true'

  document.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes(PHI_COMPONENT_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  })
  document.addEventListener('drop', (event) => {
    const selector = event.dataTransfer?.getData(PHI_COMPONENT_DRAG_TYPE) || ''
    if (!RUNTIME_SELECTOR_RE.test(selector)) return
    const component = findVisibleRuntimeComponent(editor, selector)
    const element = component?.getEl()
    if (!component || !element) return
    event.preventDefault()
    const bounds = element.getBoundingClientRect()
    moveRuntimeComponent(
      editor,
      component,
      event.clientX - bounds.left - bounds.width / 2,
      event.clientY - bounds.top - bounds.height / 2,
    )
  })
}

function installStableStyleBridge(editor: Editor) {
  editor.on('component:resize:init', (options) => {
    if (!getRuntimeSelector(options.component) || !options.resizable) return
    const resizable = typeof options.resizable === 'object' ? options.resizable : {}
    // skipPositionUpdate is a resize command option which GrapesJS accepts at
    // runtime but omits from the nested ResizerOptions type.
    options.resizable = { ...resizable, skipPositionUpdate: true } as typeof options.resizable
  })

  let syncingStyleTarget = false
  editor.on('style:target', () => {
    if (syncingStyleTarget) return
    const component = editor.getSelected()
    if (!getRuntimeSelector(component)) return
    syncingStyleTarget = true
    selectRuntimeStyle(editor, component)
    syncingStyleTarget = false
  })

  let activeDrag: ActiveDrag | undefined
  let activeResize: ActiveResize | undefined
  editor.on('command:run:before:core:component-drag', ({ options }) => {
    const frame = editor.Canvas.getFrameEl()
    const frameDocument = editor.Canvas.getDocument()
    const shiftSnap = createShiftAwareSnapGuides(options.dragger?.snapGuides)
    options.dragger = {
      ...(options.dragger || {}),
      scale: 1,
      snapGuides: shiftSnap.guides,
      getPointerPosition: (event: MouseEvent) => {
        shiftSnap.update(event.shiftKey)
        const multiplier = editor.Canvas.getZoomMultiplier()
        const sourceDocument = (event.target as Node | null)?.ownerDocument
        if ('_parentEvent' in event || sourceDocument === frameDocument) {
          return { x: event.clientX, y: event.clientY }
        }
        // Toolbar events are synthetic objects already relative to the frame,
        // while later events from the parent document use page coordinates.
        if (!event.target) return { x: event.clientX * multiplier, y: event.clientY * multiplier }
        const bounds = frame.getBoundingClientRect()
        return {
          x: (event.clientX - bounds.left) * multiplier,
          y: (event.clientY - bounds.top) * multiplier,
        }
      },
    }
  })
  editor.on('component:drag:start', ({ target }: ComponentDragEventData) => {
    const selector = getRuntimeSelector(target)
    if (!target || !selector) return
    const [startX, startY] = currentTranslate(target)
    const undoWasTracking = Boolean((editor.UndoManager as unknown as { isTracking?: () => boolean }).isTracking?.() ?? true)
    if (undoWasTracking) editor.UndoManager.stop()

    // GrapesJS' translate dragger reads component-local styles. Seed only the
    // current stable translation, not the full computed transform matrix.
    editor.UndoManager.skip(() => editor.Css.setIdRule(target.getId(), {
      transform: `translateX(${startX}px) translateY(${startY}px)`,
    }))
    activeDrag = { component: target, selector, startX, startY, undoWasTracking }
  })

  editor.on('component:drag:end', ({ target, cancelled }: ComponentDragEventData) => {
    const drag = activeDrag
    activeDrag = undefined
    if (!drag) return

    const idRule = editor.Css.getIdRule(drag.component.getId())
    const idStyle = idRule?.getStyle() as StyleProps | undefined
    const deltaX = transformTranslate(idStyle?.transform, 'X')
    const deltaY = transformTranslate(idStyle?.transform, 'Y')
    if (idRule) editor.UndoManager.skip(() => editor.Css.remove(idRule))
    if (drag.undoWasTracking) editor.UndoManager.start()
    if (cancelled || target !== drag.component || (!deltaX && !deltaY)) {
      selectRuntimeStyle(editor, drag.component)
      return
    }

    let rule = editor.Css.getRule(drag.selector)
    if (!rule) editor.UndoManager.skip(() => { rule = editor.Css.setRule(drag.selector) })
    if (!rule) return
    rule.addStyle({
      translate: `${cleanNumber(drag.startX + deltaX)}px ${cleanNumber(drag.startY + deltaY)}px`,
    })
    selectRuntimeStyle(editor, drag.component)
  })

  editor.on('component:resize:start', ({ component }) => {
    // GrapesJS 0.23 also emits resize:start while moving. Keep the snapshot
    // captured by the real initial event until resize:end.
    if (activeResize?.component === component) return
    const selector = getRuntimeSelector(component)
    if (!component || !selector) return
    const undoWasTracking = Boolean((editor.UndoManager as unknown as { isTracking?: () => boolean }).isTracking?.() ?? true)
    if (undoWasTracking) editor.UndoManager.stop()
    const temporaryTarget = editor.Styles.getModelToStyle(component)
    const stableTarget = editor.Css.getRule(selector)
    activeResize = {
      component,
      selector,
      style: {},
      temporaryTarget,
      temporaryStyle: { ...temporaryTarget.getStyle() },
      componentStyle: { ...component.getStyle() },
      stableTarget,
      stableStyle: { ...(stableTarget?.getStyle() || {}) },
      undoWasTracking,
    }
  })
  editor.on('component:resize:update', ({ component, style, updateStyle }) => {
    if (!activeResize || activeResize.component !== component) return
    const { top: _top, left: _left, ...dimensions } = style
    activeResize.style = { ...activeResize.style, ...dimensions }
    // Keep GrapesJS' resizer visuals in sync without creating a stored class
    // or ID rule on every pointer move. The final dimensions are committed to
    // the stable runtime selector in component:resize:end.
    updateStyle(dimensions)
  })
  editor.on('component:resize:end', ({ component }) => {
    const resize = activeResize
    activeResize = undefined
    if (!resize || resize.component !== component) return
    editor.UndoManager.skip(() => {
      if (resize.temporaryTarget === resize.stableTarget) {
        resize.temporaryTarget.setStyle(resize.stableStyle)
      } else if (resize.temporaryTarget === component as unknown) {
        component.setStyle(resize.componentStyle)
      } else if (Object.keys(resize.temporaryStyle).length) {
        resize.temporaryTarget.setStyle(resize.temporaryStyle)
      } else {
        editor.Css.remove(resize.temporaryTarget as never)
      }
    })
    if (resize.undoWasTracking) editor.UndoManager.start()
    const stableRule = editor.Css.getRule(resize.selector) || editor.Css.setRule(resize.selector)
    stableRule.addStyle(resize.style)
    selectRuntimeStyle(editor, component)
  })

  editor.on('destroy', () => {
    if (activeDrag?.undoWasTracking) editor.UndoManager.start()
    if (activeResize?.undoWasTracking) editor.UndoManager.start()
    activeDrag = undefined
    activeResize = undefined
  })
}

export function createPhiEditor(options: CreateEditorOptions) {
  const editor = grapesjs.init({
    container: options.container,
    height: '100%',
    width: 'auto',
    fromElement: false,
    storageManager: false,
    telemetry: false,
    noticeOnUnload: false,
    showToolbar: true,
    showOffsets: true,
    // Keep the frame scrollable at every zoom level. The outer stage remains
    // clipped, while the iframe itself can be reached by right-button panning.
    canvas: { scrollableCanvas: true },
    protectedCss: PROTECTED_CSS,
    components: PREVIEW_MARKUP,
    style: '',
    panels: { defaults: [] },
    selectorManager: { componentFirst: false },
    layerManager: { appendTo: options.layers },
    traitManager: { appendTo: options.traits },
    styleManager: {
      appendTo: options.styles,
      clearProperties: true,
      // Native color inputs are used for all color-bearing properties below.
      custom: false,
      sectors: [
        {
          id: 'phi-layout',
          name: '布局',
          open: true,
          properties: [
            { property: 'display', name: '显示' },
            { property: 'position', name: '定位' },
            { property: 'width', name: '宽度' },
            { property: 'height', name: '高度' },
            { property: 'top', name: '上' },
            { property: 'right', name: '右' },
            { property: 'bottom', name: '下' },
            { property: 'left', name: '左' },
            { property: 'margin', name: '外边距' },
            { property: 'padding', name: '内边距' },
            { property: 'gap', name: '间距' },
            { property: 'flex-direction', name: '排列方向' },
            { property: 'justify-content', name: '主轴对齐' },
            { property: 'align-items', name: '交叉轴对齐' },
            { property: 'grid-template-columns', name: '网格列' },
          ],
        },
        {
          id: 'phi-typography',
          name: '文字',
          open: false,
          properties: [
            { property: 'color', name: '颜色', type: 'color' },
            { property: 'font-size', name: '字号' },
            { property: 'font-weight', name: '字重' },
            { property: 'line-height', name: '行高' },
            { property: 'text-align', name: '对齐' },
            { property: 'text-shadow', name: '文字阴影' },
          ],
        },
        {
          id: 'appearance',
          name: '外观',
          open: true,
          properties: [
            { property: 'background', name: '背景' },
            { property: 'background-color', name: '背景色', type: 'color' },
            { property: 'fill', name: 'SVG 填充', type: 'color' },
            { property: 'stroke', name: 'SVG 描边', type: 'color' },
            { property: 'stroke-width', name: '描边宽度' },
            { property: 'border', name: '边框' },
            { property: 'border-radius', name: '圆角' },
            { property: 'box-shadow', name: '阴影' },
            { property: 'opacity', name: '透明度' },
            { property: 'overflow', name: '溢出' },
          ],
        },
        {
          id: 'effects',
          name: '变换',
          open: false,
          properties: [
            { property: 'translate', name: '平移' },
            { property: 'rotate', name: '旋转' },
            { property: 'scale', name: '缩放' },
            { property: 'transform', name: '组合变换' },
            { property: 'transform-origin', name: '变换原点' },
            { property: 'filter', name: '滤镜' },
            { property: 'backdrop-filter', name: '背景滤镜' },
            { property: 'clip-path', name: '裁切路径' },
          ],
        },
      ],
    },
    deviceManager: {
      default: 'phi-1200',
      devices: [{
        id: 'phi-1200',
        name: 'Phi 1200',
        width: '1200px',
        height: '1780px',
        // The fixed canvas width is not a responsive breakpoint in the exported theme.
        widthMedia: '',
      }],
    },
    parser: {
      optionsHtml: {
        allowScripts: false,
        allowUnsafeAttr: false,
        allowUnsafeAttrValue: false,
      },
    },
  })

  installStableStyleBridge(editor)
  editor.on('load', () => {
    lockEditorDocument(editor)
    installCanvasDrop(editor)
    installCanvasPan(editor)
    editor.Canvas.fitViewport({ gap: 28, zoom: (zoom) => Math.min(zoom, 80) })
    const firstCard = findVisibleRuntimeComponent(editor, '.song')
    if (firstCard) editor.select(firstCard)
    options.onReady(editor)
  })
  editor.on('update', options.onUpdate)
  return editor
}

export function resetEditorDocument(editor: Editor, css = '') {
  editor.setComponents(PREVIEW_MARKUP)
  editor.setStyle(css)
  lockEditorDocument(editor)
  editor.UndoManager.clear()
  editor.Canvas.fitViewport({ gap: 28, zoom: (zoom) => Math.min(zoom, 80) })
}
