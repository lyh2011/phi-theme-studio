import grapesjs, {
  type Component,
  type ComponentDragEventData,
  type CssRule,
  type Editor,
  type Property,
  type StyleProps,
} from 'grapesjs'
import styleBackgroundModule from 'grapesjs-style-bg'
import valueParser, { type Node as ValueNode } from 'postcss-value-parser'
import { PREVIEW_MARKUP, PROTECTED_CSS } from './preview'
import {
  appendCustomComponent,
  CUSTOM_ELEMENT_KINDS,
  isCustomComponent,
  type CustomElementKind,
} from './customElements'
import { componentLabelForSelector, localizeComponentName } from './componentLabels'

// The plugin publishes CommonJS plus ESM declarations. Vite exposes the
// CommonJS namespace in development, while Node resolves the declared default.
const styleBackground = (
  (styleBackgroundModule as unknown as { default?: typeof styleBackgroundModule }).default || styleBackgroundModule
)

export interface EditorUploadedAsset {
  [key: string]: unknown
  src: string
  name: string
}

interface CreateEditorOptions {
  container: HTMLElement
  layers: HTMLElement
  styles: HTMLElement
  traits: HTMLElement
  /** Initial static page markup. Defaults to the B19 fixture. */
  components?: string
  /** Additional protected CSS for the initial page fixture. */
  protectedCss?: string
  onReady: (editor: Editor) => void
  onUpdate: () => void
  onAssetUpload: (files: File[]) => Promise<EditorUploadedAsset[]>
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

const BACKGROUND_LAYER_DEFAULTS: Record<string, string> = {
  'background-image': 'none',
  'background-position': '0%',
  'background-position-x': '0%',
  'background-position-y': '0%',
  'background-size': 'auto',
  'background-repeat': 'repeat',
  'background-attachment': 'scroll',
  'background-origin': 'padding-box',
  'background-clip': 'border-box',
  'background-blend-mode': 'normal',
}

export function repairBackgroundLayerValue(property: string, value: string) {
  const fallback = BACKGROUND_LAYER_DEFAULTS[property]
  if (!fallback) return value

  const layers: ValueNode[][] = [[]]
  for (const node of valueParser(value).nodes) {
    if (node.type === 'div' && node.value === ',') {
      layers.push([])
    } else {
      layers[layers.length - 1].push(node)
    }
  }
  if (layers.length < 2) return value

  let changed = false
  const repaired = layers.map((nodes) => {
    const layer = valueParser.stringify(nodes).trim()
    if (layer.toLowerCase() !== 'initial') return layer
    changed = true
    return fallback
  })
  return changed ? repaired.join(', ') : value
}

export function repairBackgroundLayerStyle(style: StyleProps) {
  const repaired: StyleProps = {}
  for (const [property, value] of Object.entries(style)) {
    if (typeof value !== 'string') continue
    const nextValue = repairBackgroundLayerValue(property, value)
    if (nextValue !== value) repaired[property] = nextValue
  }
  return repaired
}

function repairEditorBackgroundLayers(editor: Editor) {
  for (const rule of editor.Css.getRules()) {
    const repaired = repairBackgroundLayerStyle(rule.getStyle())
    if (Object.keys(repaired).length) rule.addStyle(repaired)
  }
}

export function setEditorStyle(editor: Editor, style: Parameters<Editor['setStyle']>[0]) {
  editor.setStyle(style)
  normalizeEditorRulePriorities(editor)
  repairEditorBackgroundLayers(editor)
  return editor
}

interface BackgroundPropertyDefinition {
  property?: string
  name?: string
  label?: string
  default?: string
  options?: Array<{ id?: string; label?: string; title?: string; [key: string]: unknown }>
  [key: string]: unknown
}

const BACKGROUND_PROPERTY_LABELS: Record<string, string> = {
  'background-image': '图片',
  'background-repeat': '重复方式',
  'background-position': '背景位置',
  'background-attachment': '滚动方式',
  'background-size': '缩放方式',
  'background-image-color': '颜色',
  'background-image-gradient': '渐变',
  'background-image-gradient-dir': '方向',
  'background-image-gradient-type': '类型',
}

const BACKGROUND_OPTION_LABELS: Record<string, string> = {
  image: '图片',
  color: '纯色',
  grad: '渐变',
  repeat: '平铺',
  'repeat-x': '水平平铺',
  'repeat-y': '垂直平铺',
  'no-repeat': '不重复',
  space: '留空平铺',
  round: '缩放平铺',
  'left top': '左上',
  'left center': '左中',
  'left bottom': '左下',
  'right top': '右上',
  'right center': '右中',
  'right bottom': '右下',
  'center top': '中上',
  'center center': '居中',
  'center bottom': '中下',
  scroll: '随元素',
  fixed: '固定',
  local: '随内容',
  auto: '原始尺寸',
  cover: '覆盖',
  contain: '完整显示',
  right: '向右',
  bottom: '向下',
  left: '向左',
  top: '向上',
  linear: '线性',
  radial: '径向',
  'repeating-linear': '重复线性',
  'repeating-radial': '重复径向',
}

function localizeBackgroundProperty(value: unknown) {
  const property = value as BackgroundPropertyDefinition
  const label = property.property ? BACKGROUND_PROPERTY_LABELS[property.property] : undefined
  const options = property.options?.map((option) => {
    const optionLabel = option.id ? BACKGROUND_OPTION_LABELS[option.id] : undefined
    return optionLabel ? { ...option, label: option.label, title: optionLabel, ...(option.label?.startsWith('<svg') ? {} : { label: optionLabel }) } : option
  })
  return {
    ...property,
    ...(label ? { name: label, label } : {}),
    ...(property.property === 'background-image-gradient'
      ? { default: 'linear-gradient(right, #000000 0%, #ffffff 100%)' }
      : {}),
    ...(options ? { options } : {}),
  }
}

const RADIUS_PROPERTIES = [
  ['border-top-left-radius', '左上'],
  ['border-top-right-radius', '右上'],
  ['border-bottom-right-radius', '右下'],
  ['border-bottom-left-radius', '左下'],
].map(([property, name]) => ({ property, name, type: 'number', units: LENGTH_UNITS, min: 0 }))

type StyleSelectOptionDefinition = readonly [value: string, label: string]

export const STYLE_SELECT_PROPERTY_OPTIONS = {
  display: [
    ['block', '块级'],
    ['inline', '行内'],
    ['inline-block', '行内块'],
    ['flex', '弹性布局'],
    ['inline-flex', '行内弹性布局'],
    ['grid', '网格布局'],
    ['inline-grid', '行内网格布局'],
    ['flow-root', '独立流式布局'],
    ['table', '表格'],
    ['table-row', '表格行'],
    ['table-cell', '表格单元格'],
    ['list-item', '列表项'],
    ['contents', '仅保留子元素'],
    ['none', '隐藏'],
  ],
  position: [
    ['static', '标准文档流'],
    ['relative', '相对定位'],
    ['absolute', '绝对定位'],
    ['fixed', '固定于视口'],
    ['sticky', '粘性定位'],
  ],
  'flex-direction': [
    ['row', '横向'],
    ['row-reverse', '横向反转'],
    ['column', '纵向'],
    ['column-reverse', '纵向反转'],
  ],
  'justify-content': [
    ['normal', '默认'],
    ['start', '起始端'],
    ['end', '末端'],
    ['center', '居中'],
    ['flex-start', '弹性起始端'],
    ['flex-end', '弹性末端'],
    ['left', '左侧'],
    ['right', '右侧'],
    ['space-between', '两端对齐'],
    ['space-around', '均匀环绕'],
    ['space-evenly', '完全均匀'],
    ['stretch', '拉伸'],
  ],
  'align-items': [
    ['normal', '默认'],
    ['stretch', '拉伸'],
    ['start', '起始端'],
    ['end', '末端'],
    ['center', '居中'],
    ['flex-start', '弹性起始端'],
    ['flex-end', '弹性末端'],
    ['baseline', '基线'],
  ],
  'text-align': [
    ['start', '起始端'],
    ['end', '末端'],
    ['left', '左对齐'],
    ['right', '右对齐'],
    ['center', '居中'],
    ['justify', '两端对齐'],
    ['match-parent', '跟随父元素'],
  ],
  'white-space': [
    ['normal', '正常换行'],
    ['nowrap', '禁止换行'],
    ['pre', '保留空白且不换行'],
    ['pre-wrap', '保留空白并换行'],
    ['pre-line', '合并空白并换行'],
    ['break-spaces', '保留所有空白并换行'],
  ],
  overflow: [
    ['visible', '显示溢出内容'],
    ['hidden', '隐藏溢出内容'],
    ['clip', '直接裁切'],
    ['auto', '需要时滚动'],
    ['scroll', '始终可滚动'],
  ],
  'object-fit': [
    ['fill', '拉伸填满'],
    ['contain', '完整显示'],
    ['cover', '覆盖区域'],
    ['none', '保持原始尺寸'],
    ['scale-down', '自动缩小'],
  ],
} as const satisfies Record<string, readonly StyleSelectOptionDefinition[]>

type StyleSelectProperty = keyof typeof STYLE_SELECT_PROPERTY_OPTIONS

export function styleSelectOptions(property: StyleSelectProperty) {
  const options: readonly StyleSelectOptionDefinition[] = STYLE_SELECT_PROPERTY_OPTIONS[property]
  return [
    { id: '', label: '未设置（沿用页面样式）' },
    ...options.map(([id, label]) => ({ id, label: `${label}（${id}）` })),
  ]
}

function selectStyleProperty(property: StyleSelectProperty, name: string) {
  return { property, name, type: 'select' as const, full: true, options: styleSelectOptions(property) }
}

const LAYOUT_STYLE_PROPERTY_DEFINITIONS = [
  selectStyleProperty('display', '显示'),
  selectStyleProperty('position', '定位'),
  { property: 'width', name: '宽度', type: 'number', units: LENGTH_UNITS },
  { property: 'height', name: '高度', type: 'number', units: LENGTH_UNITS },
  { property: 'top', name: '上', type: 'number', units: LENGTH_UNITS },
  { property: 'right', name: '右', type: 'number', units: LENGTH_UNITS },
  { property: 'bottom', name: '下', type: 'number', units: LENGTH_UNITS },
  { property: 'left', name: '左', type: 'number', units: LENGTH_UNITS },
  { property: 'margin', name: '外边距' },
  { property: 'padding', name: '内边距' },
  { property: 'gap', name: '间距', type: 'number', units: LENGTH_UNITS },
  selectStyleProperty('flex-direction', '排列方向'),
  selectStyleProperty('justify-content', '主轴对齐'),
  selectStyleProperty('align-items', '交叉轴对齐'),
  { property: 'grid-template-columns', name: '网格列' },
] as const

const TYPOGRAPHY_STYLE_PROPERTY_DEFINITIONS = [
  { property: 'color', name: '颜色', type: 'color' },
  { property: 'font-size', name: '字号', type: 'number', units: LENGTH_UNITS_NO_PERCENT },
  { property: 'font-weight', name: '字重' },
  { property: 'line-height', name: '行高' },
  selectStyleProperty('text-align', '对齐'),
  selectStyleProperty('white-space', '空白与换行'),
  { property: 'text-shadow', name: '文字阴影' },
] as const

const APPEARANCE_STYLE_PROPERTY_DEFINITIONS = [
  // `extend` picks up GrapesJS' built-in composite controls. The background
  // plugin replaces that built-in with image/color/gradient layers.
  { property: 'background', name: '背景', extend: 'background' },
  { property: 'background-color', name: '背景色', type: 'color' },
  { property: 'fill', name: 'SVG 填充', type: 'color' },
  { property: 'stroke', name: 'SVG 描边', type: 'color' },
  { property: 'stroke-width', name: '描边宽度', type: 'number', units: LENGTH_UNITS_NO_PERCENT, min: 0 },
  { property: 'border', name: '边框' },
  { property: 'border-radius', name: '圆角', type: 'composite', properties: RADIUS_PROPERTIES, full: true },
  { property: 'box-shadow', name: '阴影' },
  { property: 'opacity', name: '透明度', extend: 'opacity' },
  selectStyleProperty('overflow', '溢出'),
  selectStyleProperty('object-fit', '图片适配'),
] as const

const EFFECT_STYLE_PROPERTY_DEFINITIONS = [
  { property: 'translate', name: '平移' },
  { property: 'rotate', name: '旋转' },
  { property: 'scale', name: '缩放' },
  { property: 'transform', name: '组合变换' },
  { property: 'transform-origin', name: '变换原点' },
  { property: 'filter', name: '滤镜' },
  { property: 'backdrop-filter', name: '背景滤镜' },
  { property: 'clip-path', name: '裁切路径' },
] as const

export const STYLE_PROPERTY_DEFINITIONS = [
  ...LAYOUT_STYLE_PROPERTY_DEFINITIONS,
  ...TYPOGRAPHY_STYLE_PROPERTY_DEFINITIONS,
  ...APPEARANCE_STYLE_PROPERTY_DEFINITIONS,
  ...EFFECT_STYLE_PROPERTY_DEFINITIONS,
] as const

export const STYLE_PROPERTY_NAMES = STYLE_PROPERTY_DEFINITIONS.map(({ property }) => property)

export function computedStylePlaceholder(value: string, type: string, units: readonly string[] = []) {
  if (type !== 'number') return value
  const match = value.match(/^([-+]?(?:\d+\.?\d*|\.\d+))([A-Za-z%]*)$/)
  return match && (!match[2] || units.includes(match[2])) ? match[1] : value
}

export function styleValueWithoutImportant(value: string) {
  return value.replace(/\s*!important\s*$/i, '').trim()
}

export interface NormalizedImportantRuleState {
  style: StyleProps
  important: boolean | string[]
  styleChanged: boolean
  importantChanged: boolean
}

/**
 * GrapesJS parses authored `!important` suffixes into the style value itself,
 * even though CssRule has first-class per-property priority metadata. Move the
 * suffix into that metadata so StyleManager always reads a plain CSS value.
 */
export function normalizeImportantRuleState(
  style: StyleProps,
  important: boolean | string[] = false,
): NormalizedImportantRuleState {
  const priority = new Set(Array.isArray(important) ? important : [])
  let styleChanged = false
  const normalized = Object.fromEntries(Object.entries(style).map(([property, value]) => {
    if (typeof value === 'string') {
      const nextValue = styleValueWithoutImportant(value)
      if (nextValue !== value.trim()) {
        styleChanged = true
        if (important !== true) priority.add(property)
        return [property, nextValue]
      }
      return [property, value]
    }
    if (Array.isArray(value)) {
      let valueChanged = false
      const nextValue = value.map((item) => {
        const normalizedItem = styleValueWithoutImportant(item)
        if (normalizedItem !== item.trim()) {
          valueChanged = true
          if (important !== true) priority.add(property)
        }
        return normalizedItem
      })
      if (valueChanged) styleChanged = true
      return [property, valueChanged ? nextValue : value]
    }
    return [property, value]
  })) as StyleProps
  const nextImportant = important === true ? true : [...priority]
  const importantChanged = important !== true && (
    !Array.isArray(important)
      ? priority.size > 0
      : important.length !== priority.size || important.some((property) => !priority.has(property))
  )
  return {
    style: normalized,
    important: importantChanged ? nextImportant : important,
    styleChanged,
    importantChanged,
  }
}

interface StylePropertyView {
  el?: HTMLElement
}

const CUSTOM_STYLE_OPTION_ATTRIBUTE = 'data-phi-custom-option'

export function syncStyleSelectValue(select: HTMLSelectElement, value: string, hasOverride: boolean) {
  select.querySelector(`option[${CUSTOM_STYLE_OPTION_ATTRIBUTE}]`)?.remove()
  if (!hasOverride) {
    select.value = ''
    return
  }
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value
    return
  }

  const option = select.ownerDocument.createElement('option')
  option.setAttribute(CUSTOM_STYLE_OPTION_ATTRIBUTE, '')
  option.value = value
  option.textContent = `已有自定义值（${value}）`
  option.selected = true
  select.append(option)
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
  if (property.getType() === 'select') {
    const select = root.querySelector<HTMLSelectElement>('.gjs-field select:not(.gjs-input-unit)')
    if (select) syncStyleSelectValue(select, value, hasOverride)
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
        if (property.getType() === 'select') {
          const select = root.querySelector<HTMLSelectElement>('.gjs-field select:not(.gjs-input-unit)')
          if (select) syncStyleSelectValue(select, '', false)
        }
        if (COLOR_PROPERTIES.has(property.getName())) {
          root.querySelector<HTMLElement>('.gjs-field-color-picker')?.style.removeProperty('background-color')
        }
      }
    }
    return
  }

  const selector = getRuntimeSelector(component)
  const target = selector ? getRuntimeOverrideRule(editor, selector) : editor.Styles.getSelected()
  const targetStyle = target?.getStyle() || {}
  const computed = view.getComputedStyle(element)
  const sectors = editor.Styles.getSectors({ array: true })

  for (const sector of sectors) {
    for (const property of sector.getProperties()) {
      const name = property.getName()
      const rawValue = targetStyle[name]
      const hasOverride = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== ''
      const value = hasOverride
        ? styleValueWithoutImportant(String(rawValue))
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
      const selector = getRuntimeSelector(editor.getSelected())
      if (selector) container.dataset.phiStyleSelector = selector
      else delete container.dataset.phiStyleSelector
    }) || 0
  }
  const targetEvents = 'load component:selected component:deselected style:target'
  const updateEvents = 'style:property:update update undo redo phi:preview:update'
  const scheduleTarget = () => {
    delete container.dataset.phiStyleSelector
    schedule()
  }
  editor.on(targetEvents, scheduleTarget)
  editor.on(updateEvents, schedule)
  editor.on('destroy', () => {
    if (frame) ownerWindow?.cancelAnimationFrame(frame)
    delete container.dataset.phiStyleSelector
    editor.off(targetEvents, scheduleTarget)
    editor.off(updateEvents, schedule)
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

const COLOR_PICKER_TRIGGER = '.gjs-field-color-picker, [data-toggle="handler-color-wrap"]'

const STYLE_CONTROL_TOOLTIPS = [
  ['[data-add-layer]', '添加背景层'],
  ['[data-close-layer]', '删除背景层'],
  ['[data-move-layer]', '拖动背景层'],
  ['.gjs-field-color-picker', '选择颜色'],
  ['[data-toggle="handler-color-wrap"]', '选择渐变颜色'],
  ['[data-toggle="handler-close"]', '删除渐变色标'],
  ['[data-toggle="handler-drag"]', '拖动渐变色标'],
] as const

function installStyleControlTooltips(container: HTMLElement, editor: Editor) {
  const apply = () => {
    for (const [selector, label] of STYLE_CONTROL_TOOLTIPS) {
      for (const element of container.querySelectorAll<HTMLElement>(selector)) {
        element.title = label
        element.setAttribute('aria-label', label)
        if (element.matches(COLOR_PICKER_TRIGGER)) {
          element.setAttribute('role', 'button')
          if (!element.hasAttribute('tabindex')) element.tabIndex = 0
        }
      }
    }
    for (const property of STYLE_PROPERTY_DEFINITIONS) {
      if (!('type' in property) || property.type !== 'select') continue
      const select = container.querySelector<HTMLSelectElement>(`.gjs-sm-property__${property.property} select`)
      if (!select) continue
      select.title = `${property.name}选项`
      select.setAttribute('aria-label', `${property.name}选项`)
    }
  }
  apply()
  const Observer = container.ownerDocument.defaultView?.MutationObserver
  if (!Observer) return
  const observer = new Observer(apply)
  observer.observe(container, { childList: true, subtree: true })
  editor.on('destroy', () => observer.disconnect())
}

interface PickerRectangle {
  left: number
  right: number
  top: number
  bottom: number
}

interface PickerSize {
  width: number
  height: number
}

export function colorPickerPopupPosition(
  anchor: PickerRectangle,
  popup: PickerSize,
  viewport: PickerSize,
  margin = 8,
  gap = 6,
) {
  const maxLeft = Math.max(margin, viewport.width - popup.width - margin)
  const left = Math.min(Math.max(anchor.right - popup.width, margin), maxLeft)
  const below = anchor.bottom + gap
  const above = anchor.top - popup.height - gap
  const preferredTop = below + popup.height <= viewport.height - margin ? below : above
  const maxTop = Math.max(margin, viewport.height - popup.height - margin)
  const top = Math.min(Math.max(preferredTop, margin), maxTop)
  return { left, top }
}

function installColorPickerPositioning(container: HTMLElement, editor: Editor) {
  const ownerDocument = container.ownerDocument
  const ownerWindow = ownerDocument.defaultView
  if (!ownerWindow) return

  let activeTrigger: HTMLElement | undefined
  let frame = 0
  const reposition = () => {
    frame = 0
    if (!activeTrigger?.isConnected) return
    const popup = [...ownerDocument.querySelectorAll<HTMLElement>('.sp-container:not(.sp-hidden)')]
      .find((element) => element.offsetWidth > 0 && element.offsetHeight > 0)
    if (!popup) return
    const anchor = activeTrigger.getBoundingClientRect()
    const bounds = popup.getBoundingClientRect()
    const position = colorPickerPopupPosition(
      anchor,
      bounds,
      { width: ownerDocument.documentElement.clientWidth, height: ownerDocument.documentElement.clientHeight },
    )
    popup.style.position = 'fixed'
    popup.style.left = `${position.left}px`
    popup.style.top = `${position.top}px`
  }
  const schedule = () => {
    if (frame) ownerWindow.cancelAnimationFrame(frame)
    frame = ownerWindow.requestAnimationFrame(reposition)
  }
  const activate = (event: Event) => {
    if (!(event.target instanceof Element)) return
    const direct = event.target.closest<HTMLElement>(COLOR_PICKER_TRIGGER)
    if (direct) {
      activeTrigger = direct
      schedule()
      return
    }
    const field = event.target.closest<HTMLElement>('.gjs-field-colorp')
    const trigger = field?.querySelector<HTMLElement>('.gjs-field-color-picker')
    if (trigger) trigger.click()
  }
  const keyboard = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (!(event.target instanceof Element)) return
    const trigger = event.target.closest<HTMLElement>(COLOR_PICKER_TRIGGER)
    if (!trigger) return
    event.preventDefault()
    trigger.click()
  }

  container.addEventListener('click', activate, true)
  container.addEventListener('touchstart', activate, { capture: true, passive: true })
  container.addEventListener('keydown', keyboard)
  container.addEventListener('scroll', schedule, true)
  ownerWindow.addEventListener('resize', schedule)
  editor.on('destroy', () => {
    if (frame) ownerWindow.cancelAnimationFrame(frame)
    container.removeEventListener('click', activate, true)
    container.removeEventListener('touchstart', activate, true)
    container.removeEventListener('keydown', keyboard)
    container.removeEventListener('scroll', schedule, true)
    ownerWindow.removeEventListener('resize', schedule)
  })
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
const RUNTIME_OVERRIDE_SPECIFICITY_ANCHOR = `:root${Array.from(
  { length: 8 },
  (_, index) => `:is(#phi-theme-studio-override-${index},:root)`,
).join('')}`
const RUNTIME_VISIBILITY_SPECIFICITY_ANCHOR = `${RUNTIME_OVERRIDE_SPECIFICITY_ANCHOR}:is(#phi-theme-studio-visibility,:root)`

function encodedRuntimeSelector(selector: string) {
  return Array.from(selector, (character) => character.codePointAt(0)!.toString(16)).join('-')
}

export function runtimeOverridePrimarySelector(selector: string) {
  return `.phi-theme-studio-override-${encodedRuntimeSelector(selector)}`
}

export function runtimeOverrideTargetSelector(selector: string) {
  return `${RUNTIME_OVERRIDE_SPECIFICITY_ANCHOR} ${selector}`
}

export function runtimeOverrideCombinedSelector(selector: string) {
  return `${runtimeOverridePrimarySelector(selector)}, ${runtimeOverrideTargetSelector(selector)}`
}

export function runtimeVisibilityPrimarySelector(selector: string) {
  return `.phi-theme-studio-visibility-${encodedRuntimeSelector(selector)}`
}

export function runtimeVisibilityTargetSelector(selector: string) {
  return `${RUNTIME_VISIBILITY_SPECIFICITY_ANCHOR} ${selector}`
}

export function runtimeVisibilityCombinedSelector(selector: string) {
  return `${runtimeVisibilityPrimarySelector(selector)}, ${runtimeVisibilityTargetSelector(selector)}`
}

function getRuntimeOverrideRule(editor: Editor, selector: string) {
  return editor.Css.getRule(runtimeOverrideCombinedSelector(selector))
}

function ensureRuntimeOverrideRule(editor: Editor, selector: string) {
  let rule = getRuntimeOverrideRule(editor, selector)
  if (!rule) {
    editor.UndoManager.skip(() => {
      rule = editor.Css.setRule(runtimeOverrideCombinedSelector(selector))
    })
  }
  return rule as CssRule
}

function getRuntimeVisibilityRule(editor: Editor, selector: string) {
  return editor.Css.getRule(runtimeVisibilityCombinedSelector(selector))
}

function ensureRuntimeVisibilityRule(editor: Editor, selector: string) {
  let rule = getRuntimeVisibilityRule(editor, selector)
  if (!rule) {
    editor.UndoManager.skip(() => {
      rule = editor.Css.setRule(runtimeVisibilityCombinedSelector(selector))
      rule.set('important', ['display'])
    })
  }
  return rule as CssRule
}

function hasDeclaredStyleValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function normalizeRulePriority(editor: Editor, rule: CssRule) {
  const currentStyle = rule.getStyle()
  const currentImportant = rule.get('important') || false
  const normalized = normalizeImportantRuleState(currentStyle, currentImportant)
  if (!normalized.styleChanged && !normalized.importantChanged) return
  editor.UndoManager.skip(() => {
    if (normalized.styleChanged) rule.setStyle(normalized.style, { noEvent: true })
    if (normalized.importantChanged) rule.set('important', normalized.important)
  })
}

function normalizeEditorRulePriorities(editor: Editor) {
  for (const rule of editor.Css.getRules()) normalizeRulePriority(editor, rule)
}

function ruleHasPropertyPriority(rule: CssRule, property: string) {
  const important = rule.get('important')
  return important === true || (Array.isArray(important) && important.includes(property))
}

function addRulePropertyPriority(rule: CssRule, property: string) {
  const important = rule.get('important')
  if (important === true || (Array.isArray(important) && important.includes(property))) return false
  rule.set('important', [...(Array.isArray(important) ? important : []), property])
  return true
}

function removeRulePropertyPriority(rule: CssRule, property: string) {
  const important = rule.get('important')
  if (important === true) {
    rule.set('important', Object.entries(rule.getStyle())
      .filter(([name, value]) => name !== property && hasDeclaredStyleValue(value))
      .map(([name]) => name))
    return true
  }
  if (!Array.isArray(important) || !important.includes(property)) return false
  rule.set('important', important.filter((name) => name !== property))
  return true
}

function addPrioritizedRuleStyle(rule: CssRule, style: StyleProps) {
  const normalized = normalizeImportantRuleState(style)
  for (const [property, value] of Object.entries(normalized.style)) {
    if (!hasDeclaredStyleValue(value)) continue
    addRulePropertyPriority(rule, property)
  }
  rule.addStyle(normalized.style)
}

export function getRuntimeSelector(component: Component | undefined) {
  const value = component?.getAttributes()['data-phi-selector']
  return typeof value === 'string' && RUNTIME_SELECTOR_RE.test(value) ? value : ''
}

export function derivedTextRuntimeSelector(tagName: string, parentSelector: string) {
  const tag = tagName.toLowerCase()
  return (tag === 'p' || tag === 'span') && RUNTIME_SELECTOR_RE.test(parentSelector)
    ? `${parentSelector} ${tag}`
    : ''
}

function lockComponent(component: Component) {
  let runtimeSelector = getRuntimeSelector(component)
  if (!runtimeSelector) {
    runtimeSelector = derivedTextRuntimeSelector(
      String(component.get('tagName') || ''),
      getRuntimeSelector(component.parent()),
    )
    if (runtimeSelector) component.addAttributes({ 'data-phi-selector': runtimeSelector })
  }
  const customKind = component.getAttributes()['data-phi-custom']
  const isCustom = typeof customKind === 'string' && customKind.length > 0
  const configuredName = component.get('name')
  const name = typeof configuredName === 'string' && configuredName
    ? localizeComponentName(configuredName)
    : runtimeSelector
      ? componentLabelForSelector(runtimeSelector)
      : localizeComponentName(component.getName() || '组件')
  component.set({
    name,
    // Translate mode changes visual position only; the runtime template structure stays fixed.
    draggable: Boolean(runtimeSelector) || isCustom,
    droppable: false,
    // The delete command translates fixed template nodes into a stable hide rule.
    removable: Boolean(runtimeSelector) || isCustom,
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
  if (wrapper) {
    wrapper.set('name', '画布')
    lockComponent(wrapper)
  }
  editor.setDragMode('translate')
}

function isVisible(component: Component) {
  const element = component.getEl()
  return Boolean(element && !element.closest('[data-phi-preview-hidden]'))
}

export function findVisibleRuntimeComponent(editor: Editor, selector: string) {
  return editor.getWrapper()?.find(selector).find(isVisible)
}

export function selectRuntimeStyle(editor: Editor, component: Component | undefined) {
  const selector = getRuntimeSelector(component)
  if (!component || !selector) return
  const rule = ensureRuntimeOverrideRule(editor, selector)
  if (editor.Styles.getSelected() !== rule) editor.Styles.select(rule, { component })
}

function declaredStyleCount(style: StyleProps | undefined) {
  if (!style) return 0
  return Object.entries(style).filter(([property, value]) => (
    !property.startsWith('__') && hasDeclaredStyleValue(value)
  )).length
}

export interface SelectionAncestor {
  id: string
  name: string
  selector: string
}

export interface SelectionInfo {
  name: string
  selector: string
  overrides: number
  ancestors: SelectionAncestor[]
}

export type ComponentShapeMode = 'parallelogram' | 'rectangle'
export type StatsTableLayout = 'slanted' | 'orthogonal'

export interface SelectedShapeMode {
  mode: ComponentShapeMode
  slantedLabel: '平行四边形' | '斜角'
}

const CLIPPED_COMPONENT_CLASSES = new Set([
  'clip-box',
  'clip-box-left',
  'clip-box-right',
  // The Arcaea-style player backdrop uses a fixed pixel polygon instead of
  // the shared `clip-box` custom-property shape.
  'player_broad',
])
const DIFFICULTY_SHAPE_SELECTORS = ['.rank-AT', '.rank-IN', '.rank-HD', '.rank-EZ'] as const
const PARALLELOGRAM_CLIP_PATH = 'polygon(100% 0, calc(100% - calc(var(--height) * var(--clipSlope))) 100%, 0 100%, calc(var(--height) * var(--clipSlope)) 0)'
const PLAYER_BROAD_CLIP_PATH = 'polygon(100% 0%, 100% 100%, 17.75px 100%, 0% 70%, 35.5px 0%)'
const LEFT_ANGLE_CLIP_PATH = 'polygon(100% 0, 100% 100%, 0 100%, calc(var(--height) * var(--clipSlope)) 0)'
const RIGHT_ANGLE_CLIP_PATH = 'polygon(100% 0, calc(100% - calc(var(--height) * var(--clipSlope))) 100%, 0 100%, 0 0)'

export function clipPathForShape(mode: ComponentShapeMode, classes: readonly string[] = []) {
  if (mode === 'rectangle') return 'none'
  if (classes.includes('player_broad')) return PLAYER_BROAD_CLIP_PATH
  if (classes.includes('clip-box-left')) return LEFT_ANGLE_CLIP_PATH
  if (classes.includes('clip-box-right')) return RIGHT_ANGLE_CLIP_PATH
  return PARALLELOGRAM_CLIP_PATH
}

export function statsRowOffsets(mode: StatsTableLayout) {
  return mode === 'orthogonal'
    ? ['0', '0', '0', '0']
    : [
        'calc(var(--row) * 3)',
        'calc(var(--row) * 2)',
        'calc(var(--row) * 1)',
        '0',
      ]
}

function clippedComponentClasses(component: Component) {
  return component.getClasses().filter((className) => CLIPPED_COMPONENT_CLASSES.has(className))
}

function closestRuntimeComponent(
  component: Component | undefined,
  predicate: (candidate: Component) => boolean,
) {
  for (let candidate = component; candidate; candidate = candidate.parent()) {
    if (getRuntimeSelector(candidate) && predicate(candidate)) return candidate
  }
  return undefined
}

function shapeControlTarget(component: Component | undefined) {
  return closestRuntimeComponent(component, (candidate) => clippedComponentClasses(candidate).length > 0)
}

function statsTableControlTarget(component: Component | undefined) {
  return closestRuntimeComponent(component, (candidate) => getRuntimeSelector(candidate) === '.recordInfo')
}

export function shapeControlTargetSelector(component: Component | undefined) {
  return getRuntimeSelector(shapeControlTarget(component))
}

export function statsTableControlTargetSelector(component: Component | undefined) {
  return getRuntimeSelector(statsTableControlTarget(component))
}

function shapeSelectors(selector: string) {
  return DIFFICULTY_SHAPE_SELECTORS.includes(selector as (typeof DIFFICULTY_SHAPE_SELECTORS)[number])
    ? [...DIFFICULTY_SHAPE_SELECTORS]
    : [selector]
}

function addRuleStyle(editor: Editor, selector: string, style: StyleProps) {
  addPrioritizedRuleStyle(ensureRuntimeOverrideRule(editor, selector), style)
}

export function selectedShapeMode(editor: Editor | null): SelectedShapeMode | undefined {
  const component = shapeControlTarget(editor?.getSelected())
  const selector = getRuntimeSelector(component)
  const classes = component ? clippedComponentClasses(component) : []
  const element = component?.getEl()
  const view = element?.ownerDocument.defaultView
  if (!editor || !component || !selector || !classes.length || !element || !view) return undefined
  return {
    mode: view.getComputedStyle(element).clipPath === 'none' ? 'rectangle' : 'parallelogram',
    slantedLabel: classes.some((className) => className !== 'clip-box') ? '斜角' : '平行四边形',
  }
}

export function setSelectedShapeMode(editor: Editor, mode: ComponentShapeMode) {
  const component = shapeControlTarget(editor.getSelected())
  const selector = getRuntimeSelector(component)
  const classes = component ? clippedComponentClasses(component) : []
  if (!component || !selector || !classes.length) return false
  const clipPath = `${clipPathForShape(mode, classes)} !important`
  for (const target of shapeSelectors(selector)) {
    addRuleStyle(editor, target, { 'clip-path': clipPath })
  }
  selectRuntimeStyle(editor, component)
  return true
}

export function selectedStatsTableLayout(editor: Editor | null): StatsTableLayout | undefined {
  const component = statsTableControlTarget(editor?.getSelected())
  if (!component) return undefined
  const rows = component.getEl()?.querySelectorAll<HTMLElement>('.row')
  const view = component.getEl()?.ownerDocument.defaultView
  if (!rows?.length || !view) return 'slanted'
  const offsets = [...rows].map((row) => view.getComputedStyle(row).left)
  return new Set(offsets).size === 1 ? 'orthogonal' : 'slanted'
}

export function setStatsTableLayout(editor: Editor, mode: StatsTableLayout) {
  const component = statsTableControlTarget(editor.getSelected())
  if (!component) return false
  statsRowOffsets(mode).forEach((left, index) => {
    addRuleStyle(editor, `.recordInfo .row:nth-child(${index + 1})`, {
      left: `${left} !important`,
    })
  })
  selectRuntimeStyle(editor, component)
  return true
}

const MAX_ANCESTORS = 3

function componentName(component: Component) {
  return component.getName() || component.get('name') || '组件'
}

export function describeSelection(editor: Editor | null): SelectionInfo {
  const component = editor?.getSelected()
  if (!editor || !component) return { name: '未选中元素', selector: '', overrides: 0, ancestors: [] }
  const selector = getRuntimeSelector(component)
  const style = selector ? getRuntimeOverrideRule(editor, selector)?.getStyle() as StyleProps | undefined : undefined
  const ancestors: SelectionAncestor[] = []
  for (let parent = component.parent(); parent; parent = parent.parent()) {
    const parentSelector = getRuntimeSelector(parent)
    if (!parentSelector) continue
    ancestors.unshift({ id: parent.getId(), name: componentName(parent), selector: parentSelector })
  }
  return {
    name: componentName(component),
    selector,
    overrides: declaredStyleCount(style),
    ancestors: ancestors.slice(-MAX_ANCESTORS),
  }
}

/** Clicking the canvas lands on the innermost element; this climbs back out. */
export function selectAncestor(editor: Editor, id: string) {
  for (let parent = editor.getSelected()?.parent(); parent; parent = parent.parent()) {
    if (parent.getId() !== id) continue
    editor.select(parent)
    editor.Canvas.scrollTo(parent, { behavior: 'smooth', block: 'center', force: true })
    return true
  }
  return false
}

/** Drop every override the theme has declared for the selected runtime selector. */
export function clearSelectedOverrides(editor: Editor) {
  const component = editor.getSelected()
  const selector = getRuntimeSelector(component)
  if (!component || !selector) return 0
  const rule = getRuntimeOverrideRule(editor, selector)
  const cleared = declaredStyleCount(rule?.getStyle() as StyleProps | undefined)
  if (!rule) return 0
  const important = rule.get('important')
  const hasPriority = important === true || (Array.isArray(important) && important.length > 0)
  if (!cleared && !hasPriority) return 0
  rule.setStyle({})
  if (hasPriority) rule.set('important', [])
  editor.Styles.select(rule, { component })
  return cleared
}

/**
 * Keep component visibility edits in the same stable CSS namespace as all
 * other runtime overrides. The extra specificity makes this temporary editor
 * state win over a normal display override without changing that override.
 */
export function setRuntimeComponentVisibility(
  editor: Editor,
  component: Component,
  visible: boolean,
) {
  const selector = getRuntimeSelector(component)
  if (!selector) return false

  const rule = getRuntimeVisibilityRule(editor, selector)
  if (visible) {
    if (!rule || !hasDeclaredStyleValue(rule.getStyle().display)) return false
    rule.removeStyle('display')
  } else {
    const target = rule || ensureRuntimeVisibilityRule(editor, selector)
    if (styleValueWithoutImportant(String(target.getStyle().display || '')) === 'none') return false
    addPrioritizedRuleStyle(target, { display: 'none' })
  }

  editor.Layers.updateLayer(component)
  editor.trigger('component:toggled', component)
  return true
}

function installStableLayerVisibility(editor: Editor) {
  const layers = editor.Layers
  const originalSetVisible = layers.setVisible
  const originalIsVisible = layers.isVisible
  const stableSetVisible: typeof layers.setVisible = (component, value) => {
    // Components without a runtime selector are not exportable. Silently
    // leave them alone rather than letting GrapesJS create an unstable ID rule.
    if (!getRuntimeSelector(component)) return
    setRuntimeComponentVisibility(editor, component, value)
  }
  const stableIsVisible: typeof layers.isVisible = (component) => {
    const selector = getRuntimeSelector(component)
    if (!selector) return originalIsVisible.call(layers, component)
    const rule = getRuntimeVisibilityRule(editor, selector)
    return styleValueWithoutImportant(String(rule?.getStyle().display || '')) !== 'none'
  }
  layers.setVisible = stableSetVisible
  layers.isVisible = stableIsVisible
  editor.on('destroy', () => {
    if (layers.setVisible === stableSetVisible) layers.setVisible = originalSetVisible
    if (layers.isVisible === stableIsVisible) layers.isVisible = originalIsVisible
  })
}

interface StableDeleteOptions {
  component?: Component | Component[]
}

function componentsFromDeleteOptions(editor: Editor, options?: StableDeleteOptions) {
  const value = options?.component
  if (Array.isArray(value)) return value
  if (value) return [value]
  return editor.getSelectedAll()
}

function runStableComponentDelete(editor: Editor, options?: StableDeleteOptions) {
  const hidden: Component[] = []
  const removed: Component[] = []
  for (const component of componentsFromDeleteOptions(editor, options)) {
    if (isCustomComponent(component)) {
      if (!component.get('removable')) continue
      component.remove()
      removed.push(component)
      continue
    }
    if (getRuntimeSelector(component)) {
      setRuntimeComponentVisibility(editor, component, false)
      hidden.push(component)
    }
  }
  for (const component of [...hidden, ...removed]) editor.selectRemove(component)
  return [...hidden, ...removed]
}

function installStableComponentDelete(editor: Editor) {
  editor.Commands.add('core:component-delete', {
    run: (instance, _sender, options?: StableDeleteOptions) => (
      runStableComponentDelete(instance, options)
    ),
  })
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
  const rule = ensureRuntimeOverrideRule(editor, selector)
  addPrioritizedRuleStyle(rule, { translate: `${x}px ${y}px` })
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

  // GrapesJS asynchronously re-selects its default class/inline style target
  // after component selection. Resolve runtime components here so every path
  // (canvas, navigator, keyboard, and the deferred refresh) lands on the same
  // stable selector rule.
  const originalGetModelToStyle = editor.Styles.getModelToStyle
  const stableGetModelToStyle: typeof editor.Styles.getModelToStyle = (model, options) => {
    const component = model as Component
    const selector = typeof component?.getAttributes === 'function'
      ? getRuntimeSelector(component)
      : ''
    if (selector) {
      const rule = options?.skipAdd
        ? getRuntimeOverrideRule(editor, selector)
        : ensureRuntimeOverrideRule(editor, selector)
      if (rule) return rule
    }
    return originalGetModelToStyle.call(editor.Styles, model, options)
  }
  editor.Styles.getModelToStyle = stableGetModelToStyle

  interface StyleChangeOptions {
    __up?: boolean
    avoidStore?: boolean
    partial?: boolean
  }
  interface StylePropertyUpdateEvent {
    property?: Property
    value?: unknown
    opts?: StyleChangeOptions
  }

  const temporaryPriorities = new Map<CssRule, Set<string>>()
  const selectedRuntimeRule = () => {
    const selector = getRuntimeSelector(editor.getSelected())
    const rule = selector ? getRuntimeOverrideRule(editor, selector) : undefined
    return rule && editor.Styles.getSelected() === rule ? rule : undefined
  }
  const rememberTemporaryPriority = (rule: CssRule, property: string) => {
    let properties = temporaryPriorities.get(rule)
    if (!properties) {
      properties = new Set()
      temporaryPriorities.set(rule, properties)
    }
    properties.add(property)
  }
  const forgetTemporaryPriority = (rule: CssRule, property: string) => {
    const properties = temporaryPriorities.get(rule)
    properties?.delete(property)
    if (!properties?.size) temporaryPriorities.delete(rule)
  }
  const restoreTemporaryPriorities = () => {
    editor.UndoManager.skip(() => {
      for (const [rule, properties] of temporaryPriorities) {
        for (const property of properties) removeRulePropertyPriority(rule, property)
      }
    })
    temporaryPriorities.clear()
  }

  editor.on('style:target', restoreTemporaryPriorities)
  editor.on('undo redo', restoreTemporaryPriorities)

  // This event fires before StyleManager writes to its target. Registering the
  // property priority here makes the priority and value one grouped undo step.
  // Partial input is armed after its first write below, then re-armed as a
  // tracked change immediately before the final commit.
  editor.on('style:property:update', (event: StylePropertyUpdateEvent) => {
    const property = event?.property
    const options = event?.opts || {}
    if (!property || options.__up || options.partial || options.avoidStore) return
    const rule = selectedRuntimeRule()
    const propertyName = property.getName()
    if (!rule || !propertyName) return

    if (temporaryPriorities.get(rule)?.has(propertyName)) {
      editor.UndoManager.skip(() => removeRulePropertyPriority(rule, propertyName))
      forgetTemporaryPriority(rule, propertyName)
    }
    if (!hasDeclaredStyleValue(event.value)) return
    addRulePropertyPriority(rule, propertyName)
  })

  let normalizingStyleValue = false
  editor.on('styleable:change', (target: unknown, property: unknown, options: StyleChangeOptions = {}) => {
    if (normalizingStyleValue || typeof property !== 'string') return
    const rule = selectedRuntimeRule()
    if (!rule || target !== rule) return

    const rawValue = rule.getStyle()[property]
    if (!hasDeclaredStyleValue(rawValue)) {
      if (options.partial || options.avoidStore) {
        if (temporaryPriorities.get(rule)?.has(property)) {
          editor.UndoManager.skip(() => removeRulePropertyPriority(rule, property))
          forgetTemporaryPriority(rule, property)
        }
      } else {
        removeRulePropertyPriority(rule, property)
        forgetTemporaryPriority(rule, property)
      }
      return
    }

    if (rawValue !== undefined && rawValue !== null) {
      const normalized = normalizeImportantRuleState({ [property]: rawValue })
      if (normalized.styleChanged) {
        normalizingStyleValue = true
        try {
          rule.addStyle({ [property]: normalized.style[property] }, options)
        } finally {
          normalizingStyleValue = false
        }
      }
    }

    if (options.partial || options.avoidStore) {
      if (!ruleHasPropertyPriority(rule, property)) {
        editor.UndoManager.skip(() => addRulePropertyPriority(rule, property))
        rememberTemporaryPriority(rule, property)
      }
      return
    }

    // Custom StyleManager property types may bypass style:property:update.
    // Their completed write still receives the same per-property priority.
    addRulePropertyPriority(rule, property)
    forgetTemporaryPriority(rule, property)
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

    const rule = ensureRuntimeOverrideRule(editor, drag.selector)
    addPrioritizedRuleStyle(rule, {
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
    const stableTarget = getRuntimeOverrideRule(editor, selector)
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
    const stableRule = ensureRuntimeOverrideRule(editor, resize.selector)
    addPrioritizedRuleStyle(stableRule, resize.style)
    selectRuntimeStyle(editor, component)
  })

  editor.on('destroy', () => {
    restoreTemporaryPriorities()
    if (editor.Styles.getModelToStyle === stableGetModelToStyle) {
      editor.Styles.getModelToStyle = originalGetModelToStyle
    }
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
    // `undefined` keeps the legacy B19 defaults; an explicit empty string is
    // useful for the multi-page workspace, which replaces the frame base CSS
    // through setCanvasBaseCss when the active render target changes.
    protectedCss: options.protectedCss ?? PROTECTED_CSS,
    components: options.components ?? PREVIEW_MARKUP,
    style: '',
    panels: { defaults: [] },
    plugins: [(instance) => styleBackground(instance, { propExtender: localizeBackgroundProperty })],
    colorPicker: { appendTo: 'body' },
    i18n: {
      locale: 'zh',
      detectLocale: false,
      messages: {
        zh: {
          assetManager: {
            modalTitle: '选择元素背景图',
            uploadTitle: '上传元素背景图',
          },
          styleManager: { fileButton: '选择图片' },
        },
      },
    },
    assetManager: {
      // The studio owns the package files. GrapesJS only provides the picker
      // and sends accepted local files back through this callback.
      upload: 'phi-theme-studio-local',
      embedAsBase64: false,
      showUrlInput: false,
      multiUpload: false,
      noAssets: '暂无元素背景图',
      uploadFile: async (event, done) => {
        const target = event.target as HTMLInputElement | null
        const files = event.dataTransfer?.files || target?.files
        if (!files?.length) return
        const uploaded = await options.onAssetUpload(Array.from(files))
        done?.({ data: uploaded })
      },
    },
    selectorManager: { componentFirst: false },
    layerManager: { appendTo: options.layers },
    traitManager: { appendTo: options.traits },
    styleManager: {
      appendTo: options.styles,
      clearProperties: true,
      // GrapesJS renders Spectrum-backed controls for color properties below.
      custom: false,
      sectors: [
        {
          id: 'phi-layout',
          name: '布局',
          open: true,
          properties: [...LAYOUT_STYLE_PROPERTY_DEFINITIONS],
        },
        {
          id: 'phi-typography',
          name: '文字',
          open: false,
          properties: [...TYPOGRAPHY_STYLE_PROPERTY_DEFINITIONS],
        },
        {
          id: 'appearance',
          name: '外观',
          open: true,
          properties: [...APPEARANCE_STYLE_PROPERTY_DEFINITIONS],
        },
        {
          id: 'effects',
          name: '变换',
          open: false,
          properties: [...EFFECT_STYLE_PROPERTY_DEFINITIONS],
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
  installStyleControlTooltips(options.styles, editor)
  installColorPickerPositioning(options.styles, editor)
  installStableStyleBridge(editor)
  installStableLayerVisibility(editor)
  installStableComponentDelete(editor)
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

/**
 * Replace the active fixture while keeping the GrapesJS instance alive.
 * Page-specific base styles are injected into the iframe separately so they
 * never become exportable user overrides.
 */
export function resetEditorDocument(editor: Editor, css = '', components = PREVIEW_MARKUP) {
  editor.setComponents(components)
  setEditorStyle(editor, css)
  lockEditorDocument(editor)
  editor.UndoManager.clear()
  editor.Canvas.fitViewport({ gap: 28, zoom: (zoom) => Math.min(zoom, 80) })
}

/** Inject or replace a non-exported stylesheet in the active canvas frame. */
export function setCanvasBaseCss(editor: Editor, css: string, id = 'phi-page-base-css') {
  const document = editor.Canvas.getDocument()
  if (!document) return
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    style.dataset.phiProtected = 'true'
    document.head.append(style)
  }
  style.textContent = css
}
