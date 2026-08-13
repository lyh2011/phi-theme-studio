import grapesjs, {
  type Component,
  type ComponentDragEventData,
  type Editor,
  type Property,
  type StyleProps,
} from 'grapesjs'
import { PREVIEW_MARKUP, PROTECTED_CSS } from './preview'
import { appendCustomComponent, CUSTOM_ELEMENT_KINDS, type CustomElementKind } from './customElements'

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
export const PHI_CUSTOM_ELEMENT_DRAG_TYPE = 'application/x-phi-theme-custom-element'

const LENGTH_UNITS = ['px', '%', 'em', 'rem', 'vh', 'vw']
const LENGTH_UNITS_NO_PERCENT = ['px', 'em', 'rem', 'vh', 'vw']
const BARE_NUMBER_LIST_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[\s,]+[-+]?(?:\d+\.?\d*|\.\d+))*$/
const COLOR_PROPERTIES = new Set(['color', 'background-color', 'fill', 'stroke'])

const STYLE_PROPERTY_DEFINITIONS = [
  { property: 'display', name: '显示' },
  { property: 'position', name: '定位' },
  { property: 'width', name: '宽度', type: 'number', units: LENGTH_UNITS },
  { property: 'height', name: '高度', type: 'number', units: LENGTH_UNITS },
  { property: 'top', name: '上', type: 'number', units: LENGTH_UNITS },
  { property: 'right', name: '右', type: 'number', units: LENGTH_UNITS },
  { property: 'bottom', name: '下', type: 'number', units: LENGTH_UNITS },
  { property: 'left', name: '左', type: 'number', units: LENGTH_UNITS },
  { property: 'margin', name: '外边距' },
  { property: 'padding', name: '内边距' },
  { property: 'gap', name: '间距', type: 'number', units: LENGTH_UNITS },
  { property: 'flex-direction', name: '排列方向' },
  { property: 'justify-content', name: '主轴对齐' },
  { property: 'align-items', name: '交叉轴对齐' },
  { property: 'grid-template-columns', name: '网格列' },
  { property: 'color', name: '颜色', type: 'color' },
  { property: 'font-size', name: '字号', type: 'number', units: LENGTH_UNITS_NO_PERCENT },
  { property: 'font-weight', name: '字重' },
  { property: 'line-height', name: '行高' },
  { property: 'text-align', name: '对齐' },
  { property: 'text-shadow', name: '文字阴影' },
  { property: 'background', name: '背景' },
  { property: 'background-color', name: '背景色', type: 'color' },
  { property: 'fill', name: 'SVG 填充', type: 'color' },
  { property: 'stroke', name: 'SVG 描边', type: 'color' },
  { property: 'stroke-width', name: '描边宽度', type: 'number', units: LENGTH_UNITS_NO_PERCENT, min: 0 },
  { property: 'border', name: '边框' },
  { property: 'border-radius', name: '圆角', type: 'number', units: LENGTH_UNITS, min: 0 },
  { property: 'box-shadow', name: '阴影' },
  { property: 'opacity', name: '透明度' },
  { property: 'overflow', name: '溢出' },
  { property: 'translate', name: '平移' },
  { property: 'rotate', name: '旋转' },
  { property: 'scale', name: '缩放' },
  { property: 'transform', name: '组合变换' },
  { property: 'transform-origin', name: '变换原点' },
  { property: 'filter', name: '滤镜' },
  { property: 'backdrop-filter', name: '背景滤镜' },
  { property: 'clip-path', name: '裁切路径' },
] as const

export const STYLE_PROPERTY_NAMES = STYLE_PROPERTY_DEFINITIONS.map(({ property }) => property)

export function computedStylePlaceholder(value: string, type: string, units: readonly string[] = []) {
  if (type !== 'number') return value
  const match = value.match(/^([-+]?(?:\d+\.?\d*|\.\d+))([A-Za-z%]*)$/)
  return match && (!match[2] || units.includes(match[2])) ? match[1] : value
}

interface StylePropertyView {
  el?: HTMLElement
}

function propertyView(property: Property) {
  return (property as Property & { view?: StylePropertyView }).view
}

function renderComputedStyleDefault(property: Property, value: string, hasOverride: boolean) {
  const root = propertyView(property)?.el
  if (!root) return

  root.dataset.phiComputedValue = value
  root.toggleAttribute('data-phi-has-override', hasOverride)
  const units = property.get('units') as string[] | undefined
  const input = root.querySelector<HTMLInputElement>('input:not([type="radio"]):not([type="range"])')
  if (input) {
    input.placeholder = computedStylePlaceholder(value, property.getType(), units)
    input.dataset.phiComputedValue = value
  }
  const unit = value.match(/^[-+]?(?:\d+\.?\d*|\.\d+)([A-Za-z%]+)$/)?.[1]
  const unitSelect = root.querySelector<HTMLSelectElement>('select.gjs-input-unit')
  if (!hasOverride && unitSelect && [...unitSelect.options].some((option) => option.value === unit)) {
    unitSelect.value = unit || ''
  }
  const colorPicker = root.querySelector<HTMLElement>('.gjs-field-color-picker')
  if (colorPicker && COLOR_PROPERTIES.has(property.getName()) && !hasOverride) {
    colorPicker.style.removeProperty('background-color')
    colorPicker.style.backgroundColor = value
  }

  let hint = root.querySelector<HTMLElement>('.phi-computed-default')
  if (!hint) {
    hint = root.ownerDocument.createElement('div')
    hint.className = 'phi-computed-default'
    root.querySelector<HTMLElement>('[data-sm-fields]')?.append(hint)
  }
  hint.hidden = hasOverride
  hint.title = `默认值：${value}`
  hint.replaceChildren()

  if (COLOR_PROPERTIES.has(property.getName())) {
    const swatch = root.ownerDocument.createElement('span')
    swatch.className = 'phi-computed-swatch'
    swatch.style.background = value
    hint.append(swatch)
  }
  const label = root.ownerDocument.createElement('span')
  label.className = 'phi-computed-label'
  label.textContent = '默认'
  const output = root.ownerDocument.createElement('output')
  output.textContent = value
  hint.append(label, output)
}

export function syncComputedStyleDefaults(editor: Editor) {
  const component = editor.getSelected()
  const element = component?.getEl()
  const view = element?.ownerDocument.defaultView
  if (!component || !element || !view) {
    for (const sector of editor.Styles.getSectors({ array: true })) {
      for (const property of sector.getProperties()) {
        const root = propertyView(property)?.el
        if (!root) continue
        delete root.dataset.phiComputedValue
        root.removeAttribute('data-phi-has-override')
        root.querySelector<HTMLElement>('.phi-computed-default')?.setAttribute('hidden', '')
        const input = root.querySelector<HTMLInputElement>('input:not([type="radio"]):not([type="range"])')
        if (input) {
          input.removeAttribute('placeholder')
          delete input.dataset.phiComputedValue
        }
        if (COLOR_PROPERTIES.has(property.getName())) {
          root.querySelector<HTMLElement>('.gjs-field-color-picker')?.style.removeProperty('background-color')
        }
      }
    }
    return
  }

  const selector = getRuntimeSelector(component)
  const target = selector ? editor.Css.getRule(selector) : editor.Styles.getSelected()
  const targetStyle = target?.getStyle() || {}
  const computed = view.getComputedStyle(element)
  const sectors = editor.Styles.getSectors({ array: true })

  for (const sector of sectors) {
    for (const property of sector.getProperties()) {
      const name = property.getName()
      const rawValue = targetStyle[name]
      const hasOverride = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== ''
      const value = hasOverride
        ? String(rawValue).trim()
        : computed.getPropertyValue(name).trim() || 'initial'
      renderComputedStyleDefault(property, value, hasOverride)
    }
  }
}

function installComputedStyleDefaults(editor: Editor, container: HTMLElement) {
  let frame = 0
  const ownerWindow = container.ownerDocument.defaultView
  const schedule = () => {
    if (frame) ownerWindow?.cancelAnimationFrame(frame)
    frame = ownerWindow?.requestAnimationFrame(() => {
      frame = 0
      syncComputedStyleDefaults(editor)
    }) || 0
  }
  const events = 'load component:selected component:deselected style:target style:property:update update undo redo phi:preview:update'
  editor.on(events, schedule)
  editor.on('destroy', () => {
    if (frame) ownerWindow?.cancelAnimationFrame(frame)
    editor.off(events, schedule)
  })
}

export function normalizeStyleInputUnit(property: string, rawValue: string) {
  const units: Record<string, string> = {
    margin: 'px',
    padding: 'px',
    translate: 'px',
    rotate: 'deg',
    'transform-origin': 'px',
  }
  const value = rawValue.trim()
  const unit = units[property]
  return unit && BARE_NUMBER_LIST_RE.test(value)
    ? value.replace(/[-+]?(?:\d+\.?\d*|\.\d+)/g, (number) => `${number}${unit}`)
    : rawValue
}

function installStyleInputUnits(container: HTMLElement, editor: Editor) {
  const properties = ['margin', 'padding', 'translate', 'rotate', 'transform-origin']
  const normalize = (event: Event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const property = properties.find((name) => input.closest(`.gjs-sm-property__${name}`))
    if (!property) return
    input.value = normalizeStyleInputUnit(property, input.value)
  }
  container.addEventListener('change', normalize, true)
  editor.on('destroy', () => container.removeEventListener('change', normalize, true))
}

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

function declaredStyleCount(style: StyleProps | undefined) {
  if (!style) return 0
  return Object.entries(style).filter(([property, value]) => (
    !property.startsWith('__') && value !== undefined && value !== null && String(value).trim() !== ''
  )).length
}

export interface SelectionInfo {
  name: string
  selector: string
  overrides: number
}

export function describeSelection(editor: Editor | null): SelectionInfo {
  const component = editor?.getSelected()
  if (!editor || !component) return { name: '未选中元素', selector: '', overrides: 0 }
  const selector = getRuntimeSelector(component)
  const style = selector ? editor.Css.getRule(selector)?.getStyle() as StyleProps | undefined : undefined
  return {
    name: component.getName() || component.get('name') || '组件',
    selector,
    overrides: declaredStyleCount(style),
  }
}

/** Drop every override the theme has declared for the selected runtime selector. */
export function clearSelectedOverrides(editor: Editor) {
  const component = editor.getSelected()
  const selector = getRuntimeSelector(component)
  if (!component || !selector) return 0
  const rule = editor.Css.getRule(selector)
  const cleared = declaredStyleCount(rule?.getStyle() as StyleProps | undefined)
  if (!rule || !cleared) return 0
  rule.setStyle({})
  editor.Styles.select(rule, { component })
  return cleared
}

/**
 * Read a computed `translate` value. Browsers drop a trailing zero, so `1px 0px`
 * serializes back as `1px`; an omitted axis means no movement, not a repeat.
 */
export function parseTranslatePair(value: unknown): [number, number] {
  if (typeof value !== 'string' || value === 'none') return [0, 0]
  const [rawX, rawY] = value.trim().split(/\s+/)
  const x = Number.parseFloat(rawX)
  const y = Number.parseFloat(rawY)
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
  const individual = parseTranslatePair(style.translate)
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

const NUDGE_DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

export function nudgeDelta(key: string, shiftKey: boolean) {
  const delta = NUDGE_DELTAS[key]
  if (!delta) return undefined
  const step = shiftKey ? 10 : 1
  return [delta[0] * step, delta[1] * step] as const
}

function isTextEntry(target: EventTarget | null | undefined) {
  if (!(target instanceof Element)) return false
  const element = target as HTMLElement
  return element.isContentEditable || /^(input|textarea|select)$/i.test(element.tagName)
}

function installKeyboardNudge(editor: Editor) {
  // GrapesJS re-dispatches canvas key events on the parent document, so a single
  // listener here covers both focus contexts without applying the move twice.
  const handle = (event: KeyboardEvent) => {
    const delta = nudgeDelta(event.key, event.shiftKey)
    if (!delta || event.ctrlKey || event.metaKey || event.altKey) return
    // Forwarded events carry the frame element as target; the original one
    // still points at whatever was focused inside the canvas.
    const forwarded = (event as KeyboardEvent & { _parentEvent?: Event })._parentEvent
    if (isTextEntry(event.target) || isTextEntry(forwarded?.target)) return
    const component = editor.getSelected()
    if (!component || !getRuntimeSelector(component)) return
    event.preventDefault()
    forwarded?.preventDefault()
    moveRuntimeComponent(editor, component, delta[0], delta[1])
  }
  document.addEventListener('keydown', handle)
  editor.on('destroy', () => document.removeEventListener('keydown', handle))
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
    if (!event.dataTransfer?.types.some((type) => (
      type === PHI_COMPONENT_DRAG_TYPE || type === PHI_CUSTOM_ELEMENT_DRAG_TYPE
    ))) return
    event.preventDefault()
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(PHI_CUSTOM_ELEMENT_DRAG_TYPE) ? 'copy' : 'move'
  })
  document.addEventListener('drop', (event) => {
    const customKind = event.dataTransfer?.getData(PHI_CUSTOM_ELEMENT_DRAG_TYPE) as CustomElementKind | undefined
    if (customKind && CUSTOM_ELEMENT_KINDS.includes(customKind)) {
      event.preventDefault()
      const component = appendCustomComponent(editor, {
        kind: customKind,
        name: `自定义${customKind}`,
        x: event.clientX,
        y: event.clientY,
      })
      if (component) editor.trigger('phi:custom:drop', { component, kind: customKind })
      return
    }
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

    // GrapesJS' translate dragger reads and writes component-local styles, so it
    // uses this seed as its origin. Start it at zero: the ID rule's `transform`
    // composes with the stable rule's `translate`, which keeps the element under
    // the pointer and makes the value read back in drag:end a pure delta.
    editor.UndoManager.skip(() => editor.Css.setIdRule(target.getId(), {
      transform: 'translateX(0px) translateY(0px)',
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
          properties: STYLE_PROPERTY_DEFINITIONS.slice(0, 15),
        },
        {
          id: 'phi-typography',
          name: '文字',
          open: false,
          properties: STYLE_PROPERTY_DEFINITIONS.slice(15, 21),
        },
        {
          id: 'appearance',
          name: '外观',
          open: true,
          properties: STYLE_PROPERTY_DEFINITIONS.slice(21, 31),
        },
        {
          id: 'effects',
          name: '变换',
          open: false,
          properties: STYLE_PROPERTY_DEFINITIONS.slice(31),
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

  installStyleInputUnits(options.styles, editor)
  installStableStyleBridge(editor)
  installComputedStyleDefaults(editor, options.styles)
  editor.on('load', () => {
    lockEditorDocument(editor)
    installCanvasDrop(editor)
    installCanvasPan(editor)
    installKeyboardNudge(editor)
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
