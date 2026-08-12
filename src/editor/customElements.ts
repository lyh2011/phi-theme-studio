import type { Component, Editor, ProjectData } from 'grapesjs'
import baseB19Art from '../theme/base-b19.art?raw'
import { safeAssetPath } from '../lib/assets'

export const CUSTOM_ELEMENT_KINDS = ['text', 'rect', 'circle', 'line', 'triangle', 'image'] as const
export type CustomElementKind = (typeof CUSTOM_ELEMENT_KINDS)[number]

export interface CustomElementOptions {
  kind: CustomElementKind
  text?: string
  src?: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  color?: string
  background?: string
}

const CLASS_PREFIX = 'phi-custom-'

function number(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.round((value as number) * 100) / 100 : fallback
}

function className(kind: CustomElementKind) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return `${CLASS_PREFIX}${kind}-${suffix}`
}

function stylesFor(options: CustomElementOptions) {
  const width = number(options.width, options.kind === 'line' ? 180 : options.kind === 'text' ? 280 : 160)
  const height = number(options.height, options.kind === 'line' ? 4 : options.kind === 'text' ? 56 : 120)
  const style: Record<string, string> = {
    position: 'absolute',
    left: `${number(options.x, 70) - (options.x === undefined ? 0 : width / 2)}px`,
    top: `${number(options.y, 220) - (options.y === undefined ? 0 : height / 2)}px`,
    width: `${width}px`,
    height: `${height}px`,
    'z-index': '20',
    'box-sizing': 'border-box',
  }
  if (options.kind === 'text') {
    style.color = options.color || '#ffffff'
    style['font-size'] = '30px'
    style['line-height'] = '1.2'
    style['white-space'] = 'pre-wrap'
    style['font-family'] = 'inherit'
    style['text-shadow'] = '0 1px 3px rgba(0,0,0,.65)'
  } else if (options.kind === 'rect') {
    style.background = options.background || '#12a8c7'
    style.border = '2px solid rgba(255,255,255,.8)'
  } else if (options.kind === 'circle') {
    style.background = options.background || '#e3a33b'
    style.border = '2px solid rgba(255,255,255,.8)'
    style['border-radius'] = '50%'
  } else if (options.kind === 'triangle') {
    style.background = options.background || '#d95a4c'
    style['clip-path'] = 'polygon(50% 0, 100% 100%, 0 100%)'
  } else if (options.kind === 'line') {
    style.background = options.background || '#ffffff'
    style.height = `${Math.max(1, height)}px`
  }
  return style
}

function safeText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
}

function safeAttribute(value: unknown) {
  return safeText(typeof value === 'string' ? value : '')
}

export function isCustomComponent(component: Component | undefined) {
  const value = component?.getAttributes()['data-phi-custom']
  return typeof value === 'string' && CUSTOM_ELEMENT_KINDS.includes(value as CustomElementKind)
}

export function appendCustomComponent(editor: Editor, options: CustomElementOptions) {
  const wrapper = editor.getWrapper()
  if (!wrapper) return undefined
  const classNameValue = className(options.kind)
  const selector = `.${classNameValue}`
  const tagName = options.kind === 'image' ? 'img' : 'div'
  const text = options.text || (options.kind === 'text' ? '自定义文字' : '')
  const attributes: Record<string, string> = {
    class: classNameValue,
    'data-gjs-name': options.name || `自定义${options.kind}`,
    'data-phi-selector': selector,
    'data-phi-custom': options.kind,
    'data-phi-custom-page': 'all',
  }
  if (options.kind === 'image') {
    attributes.src = options.src || ''
    attributes.alt = options.name || '自定义图片'
  }
  const component = wrapper.append({
    tagName,
    type: options.kind === 'image' ? 'image' : options.kind === 'text' ? 'text' : 'default',
    attributes,
    content: options.kind === 'image' ? undefined : text,
  })[0]
  if (!component) return undefined
  editor.UndoManager.skip(() => editor.Css.setRule(selector, stylesFor(options)))
  // The style rule is the source of truth; avoid generating an unstable ID
  // rule from the component's inline style.
  component.setStyle({})
  component.set({
    name: options.name || `自定义${options.kind}`,
    draggable: true,
    droppable: false,
    removable: true,
    copyable: true,
    editable: options.kind === 'text',
    selectable: true,
    hoverable: true,
    stylable: true,
    resizable: options.kind === 'image' ? { ratioDefault: true } : true,
  })
  editor.select(component)
  return component
}

interface ProjectNode {
  tagName?: string
  type?: string
  content?: string
  attributes?: Record<string, unknown>
  classes?: Array<string | { name?: string }>
  components?: ProjectNode[]
}

function customNode(node: ProjectNode): ProjectNode | undefined {
  const kind = node.attributes?.['data-phi-custom']
  return typeof kind === 'string' && CUSTOM_ELEMENT_KINDS.includes(kind as CustomElementKind) ? node : undefined
}

export function collectCustomNodes(projectData: ProjectData) {
  const result: ProjectNode[] = []
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const node = value as ProjectNode
    const custom = customNode(node)
    if (custom) {
      result.push(custom)
      return
    }
    if (Array.isArray(node.components)) node.components.forEach(visit)
    if (Array.isArray((node as { pages?: unknown[] }).pages)) (node as { pages: unknown[] }).pages.forEach(visit)
    if (Array.isArray((node as { frames?: unknown[] }).frames)) (node as { frames: unknown[] }).frames.forEach(visit)
    if (node && typeof node === 'object' && 'component' in node) visit((node as { component?: unknown }).component)
  }
  visit(projectData)
  return result
}

export function restoreCustomComponents(editor: Editor, projectData: ProjectData | undefined) {
  if (!projectData) return []
  const wrapper = editor.getWrapper()
  if (!wrapper) return []
  const added: Component[] = []
  for (const node of collectCustomNodes(projectData)) {
    const clone = JSON.parse(JSON.stringify(node)) as ProjectNode & { style?: unknown }
    delete clone.style
    const component = wrapper.append(clone as never)[0]
    if (!component) continue
    component.setStyle({})
    added.push(component)
  }
  return added
}

function customClass(node: ProjectNode, kind: CustomElementKind) {
  const classes = [
    ...(node.classes || []).map((value) => typeof value === 'string' ? value : value.name || ''),
    ...String(node.attributes?.class || '').split(/\s+/),
  ]
  const expectedPrefix = `${CLASS_PREFIX}${kind}-`
  const value = classes.find((name) => name.startsWith(expectedPrefix) && /^[A-Za-z_][\w-]*$/.test(name))
  if (!value) throw new Error(`自定义${kind}元素缺少稳定 class`)
  return value
}

export function collectCustomClassNames(projectData: ProjectData) {
  return new Set(collectCustomNodes(projectData).map((node) => {
    const kind = node.attributes?.['data-phi-custom'] as CustomElementKind
    return customClass(node, kind)
  }))
}

function inlineMarkup(node: ProjectNode): string {
  if (node.type === 'textnode') return safeText(node.content || '')
  if (node.tagName === 'br') return '<br>'
  const tag = ['b', 'strong', 'i', 'em', 'u', 's', 'span'].includes(node.tagName || '')
    ? node.tagName as string
    : ''
  const content = typeof node.content === 'string'
    ? safeText(node.content)
    : (node.components || []).map(inlineMarkup).join('')
  return tag ? `<${tag}>${content}</${tag}>` : content
}

function customMarkup(node: ProjectNode, assetPaths?: ReadonlySet<string>): string {
  const kind = node.attributes?.['data-phi-custom'] as CustomElementKind
  const classValue = customClass(node, kind)
  const attributes = [
    `class="${safeAttribute(classValue)}"`,
    `data-phi-selector=".${safeAttribute(classValue)}"`,
    `data-phi-custom="${kind}"`,
  ]
  if (node.attributes?.['data-phi-custom-page'] === 'all') attributes.push('data-phi-custom-page="all"')
  for (const name of ['title', 'aria-label', 'role'] as const) {
    const value = node.attributes?.[name]
    if (typeof value === 'string' && value) attributes.push(`${name}="${safeAttribute(value)}"`)
  }
  if (kind === 'image') {
    const src = typeof node.attributes?.src === 'string' ? node.attributes.src.replace(/^\.\//, '') : ''
    if (!src.startsWith('assets/') || !safeAssetPath(src) || /[{}]/.test(src)) {
      throw new Error(`自定义图片资源路径无效：${src || '空路径'}`)
    }
    if (assetPaths && !assetPaths.has(src)) throw new Error(`缺少自定义图片资源：${src}`)
    attributes.push(`src="{{themeInfo.baseUrl}}${safeAttribute(src)}"`)
    const alt = typeof node.attributes?.alt === 'string' ? node.attributes.alt : '自定义图片'
    attributes.push(`alt="${safeAttribute(alt)}"`)
    return `<img ${attributes.join(' ')}>`
  }
  const content = typeof node.content === 'string'
    ? safeText(node.content)
    : (node.components || []).map(inlineMarkup).join('')
  return `<div ${attributes.join(' ')}>${content}</div>`
}

const CUSTOM_START = '<!-- phi-theme-studio custom elements:start -->'
const CUSTOM_END = '<!-- phi-theme-studio custom elements:end -->'
const LEGACY_MARKER = '<!-- phi-theme-studio custom elements -->'

export function stripGeneratedCustomElements(template: string) {
  const paired = template.replace(
    new RegExp(`\\s*${CUSTOM_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${CUSTOM_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'),
    '',
  )
  return paired.replace(
    new RegExp(`${LEGACY_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?={{\\/block}})`, 'g'),
    '',
  )
}

function normalizeTemplate(value: string) {
  return value.replace(/\r\n/g, '\n').trim().replace(/\s*(?={{\/block}}$)/, '\n')
}

export function sourceTemplateForEditing(template: string, hasProjectData = true) {
  if (!hasProjectData) return template
  const hasGeneratedElements = template.includes(CUSTOM_START) || template.includes(LEGACY_MARKER)
  if (!hasGeneratedElements) return normalizeTemplate(template)
  const source = normalizeTemplate(stripGeneratedCustomElements(template))
  return source === normalizeTemplate(baseB19Art) ? '' : source
}

/** Add editor-created elements to a real phi-plugin ArtTemplate. */
export function buildCustomTemplate(baseTemplate: string, projectData: ProjectData, assetPaths?: ReadonlySet<string>) {
  const nodes = collectCustomNodes(projectData)
  const cleanTemplate = stripGeneratedCustomElements(baseTemplate)
  if (!nodes.length) return cleanTemplate
  const markup = nodes.map((node) => customMarkup(node, assetPaths)).join('\n')
  const marker = '{{/block}}'
  const index = cleanTemplate.lastIndexOf(marker)
  const generated = `${CUSTOM_START}\n${markup}\n${CUSTOM_END}`
  if (index < 0) return `${cleanTemplate}\n${generated}\n`
  return `${cleanTemplate.slice(0, index)}\n${generated}\n${cleanTemplate.slice(index)}`
}

export function templateForProject(customTemplate: string, projectData: ProjectData, assetPaths?: ReadonlySet<string>) {
  const nodes = collectCustomNodes(projectData)
  const source = sourceTemplateForEditing(customTemplate)
  if (!nodes.length) return source
  return buildCustomTemplate(source || baseB19Art, projectData, assetPaths)
}
