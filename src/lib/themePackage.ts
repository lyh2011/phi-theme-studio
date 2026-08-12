import JSZip from 'jszip'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import YAML from 'yaml'
import { z } from 'zod'
import { hydrateAsset, mimeFromPath, revokeAssets, safeAssetPath } from './assets'
import {
  DIFFICULTY_COLOR_CSS,
  GENERATED_DIFFICULTY_COLORS_END,
  GENERATED_DIFFICULTY_COLORS_START,
} from './difficultyColors'
import { collectCustomClassNames, templateForProject } from '../editor/customElements'
import {
  DEFAULT_DRAFT,
  DIFFICULTY_KEYS,
  RATING_KEYS,
  type ImportedTheme,
  type PackageAsset,
  type StudioProjectFile,
  type ThemeDraft,
  type ThemeResources,
  type ValidationIssue,
} from '../types/theme'
import type { ProjectData } from 'grapesjs'

const RESERVED_IDS = new Set(['default', 'snow', 'star', 'dss2', 'topText', 'foolsDay'])
const ID_RE = /^[a-z][a-z0-9_-]*$/
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const MAX_ZIP_SIZE = 50 * 1024 * 1024
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED_SIZE = 50 * 1024 * 1024
const MAX_TEXT_SIZE = 5 * 1024 * 1024
const MAX_FILES = 128
const MAX_PROJECT_NODES = 5000
const MAX_PROJECT_DEPTH = 64
const ALLOWED_EXTENSIONS = new Set([
  'yaml', 'css', 'art', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif',
  'ttf', 'otf', 'woff', 'woff2',
])

const manifestSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  Author: z.string().optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  css: z.string().optional(),
  template: z.string().optional(),
  font: z.string().optional(),
  background: z.string().optional(),
  icon: z.record(z.string(), z.unknown()).optional(),
  color: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

export interface ExportThemeInput {
  draft: ThemeDraft
  resources: ThemeResources
  assets: PackageAsset[]
  css: string
  customTemplate: string
  templateSource?: string
  projectData: ProjectData
}

function pathExtension(path: string) {
  return path.split('.').pop()?.toLowerCase() || ''
}

type ZipEntry = JSZip.JSZipObject & {
  _data?: { compressedSize?: number; uncompressedSize?: number }
}

function declaredUncompressedSize(entry: ZipEntry) {
  const size = entry._data?.uncompressedSize
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : undefined
}

function declaredCompressedSize(entry: ZipEntry) {
  const size = entry._data?.compressedSize
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : undefined
}

function normalizePackagePath(value: string) {
  const normalized = value.trim().replace(/^\.\//, '')
  return safeAssetPath(normalized) ? normalized : undefined
}

function assertZipBudget(entries: ZipEntry[]) {
  let total = 0
  for (const entry of entries) {
    const size = declaredUncompressedSize(entry)
    if (size === undefined) continue
    const extension = pathExtension(entry.name)
    const limit = ['yaml', 'css', 'art', 'json'].includes(extension) ? MAX_TEXT_SIZE : MAX_FILE_SIZE
    if (size > limit) throw new Error(`文件解压后超过限制：${entry.name}`)
    total += size
    if (total > MAX_TOTAL_UNCOMPRESSED_SIZE) throw new Error('ZIP 解压后总大小超过 50 MB')
    const compressed = declaredCompressedSize(entry)
    if (compressed && size > 1024 * 1024 && size / compressed > 1000) {
      throw new Error(`ZIP 压缩比异常，疑似压缩炸弹：${entry.name}`)
    }
  }
}

async function readEntryBytes(
  entry: ZipEntry,
  limit: number,
  label: string,
  budget: { total: number },
) {
  const bytes = await entry.async('uint8array')
  if (bytes.byteLength > limit) throw new Error(`文件解压后超过限制：${label}`)
  budget.total += bytes.byteLength
  if (budget.total > MAX_TOTAL_UNCOMPRESSED_SIZE) throw new Error('ZIP 解压后总大小超过 50 MB')
  return bytes
}

function normalizeCssUrl(url: string) {
  return decodeCssEscapes(url.trim().replace(/^(['"])(.*)\1$/, '$2'))
}

function invalidCssUrl(url: string) {
  const normalized = url.replace(/^\.\//, '')
  if (/^(?:data|blob|https?|javascript|file):/i.test(normalized)) return true
  try {
    return !safeAssetPath(decodeURIComponent(normalized))
  } catch {
    return true
  }
}

function decodeCssEscapes(value: string) {
  return value.replace(/\\([0-9a-f]{1,6})(?:\s)?/gi, (_match, hex: string) => {
    const codePoint = Number.parseInt(hex, 16)
    return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : ''
  }).replace(/\\([^\r\n])/g, '$1')
}

function isGeneratedSelector(selector: string) {
  // GrapesJS creates ids such as #i390l for components without a runtime class.
  return /(^|[^a-z0-9_-])#i[a-z0-9]{4,}(?=$|[^a-z0-9_-])/i.test(selector)
}

function walkAssetFunctions(nodes: valueParser.Node[], callback: (url: string) => void) {
  for (const node of nodes) {
    if (node.type !== 'function') continue
    const name = decodeCssEscapes(node.value).toLowerCase()
    if (name === 'url') {
      callback(normalizeCssUrl(valueParser.stringify(node.nodes)))
      continue
    }
    if (name === 'image-set' || name === '-webkit-image-set') {
      let candidate: valueParser.Node | undefined
      const flush = () => {
        if (!candidate) return
        if (candidate.type === 'string' || candidate.type === 'word') {
          callback(normalizeCssUrl(valueParser.stringify(candidate)))
        }
        candidate = undefined
      }
      for (const child of node.nodes) {
        if (child.type === 'div' && child.value === ',') {
          flush()
        } else if (!candidate && child.type !== 'space' && child.type !== 'comment') {
          candidate = child
        }
        if (child.type === 'function') walkAssetFunctions([child], callback)
      }
      flush()
      continue
    }
    walkAssetFunctions(node.nodes, callback)
  }
}

export function rewriteCssUrls(css: string, mapUrl: (url: string) => string) {
  const root = postcss.parse(css)
  root.walkDecls((declaration) => {
    const parsed = valueParser(declaration.value)
    parsed.walk((node) => {
      if (node.type !== 'function' || decodeCssEscapes(node.value).toLowerCase() !== 'url') return
      const original = normalizeCssUrl(valueParser.stringify(node.nodes))
      const mapped = mapUrl(original)
      node.nodes = [{ type: 'word', value: JSON.stringify(mapped), sourceIndex: 0, sourceEndIndex: mapped.length }]
    })
    declaration.value = parsed.toString()
  })
  return root.toString()
}

export function cleanImportedCss(css: string) {
  const root = postcss.parse(css)
  let generatedDifficultyColors = false
  root.each((node) => {
    if (node.type === 'comment' && node.text.trim() === GENERATED_DIFFICULTY_COLORS_START) {
      generatedDifficultyColors = true
      node.remove()
      return
    }
    if (node.type === 'comment' && node.text.trim() === GENERATED_DIFFICULTY_COLORS_END) {
      generatedDifficultyColors = false
      node.remove()
      return
    }
    if (generatedDifficultyColors) node.remove()
  })
  root.walkAtRules('import', (rule) => {
    const value = rule.params.replace(/['"\s]/g, '')
    if (value.endsWith('b19.css') || value.endsWith('common.css')) rule.remove()
  })
  return root.toString().trim()
}

export function validateThemeCss(css: string, previewUrlToPath?: Map<string, string>) {
  let root: postcss.Root
  try {
    root = postcss.parse(css)
  } catch (error) {
    throw new Error(`CSS 解析失败：${error instanceof Error ? error.message : String(error)}`)
  }
  root.walkAtRules('import', () => {
    throw new Error('覆盖样式中不能包含 @import，基础样式会在导出时自动加入。')
  })
  root.walkRules((rule) => {
    if (isGeneratedSelector(rule.selector)) {
      throw new Error(`CSS 选择器 ${rule.selector} 来自编辑器临时 ID，无法在 phi-plugin 模板中稳定匹配。请选择带有类名的组件。`)
    }
  })
  root.walkDecls((declaration) => {
    if (/expression\s*\(|javascript\s*:/i.test(declaration.value)) {
      throw new Error(`属性 ${declaration.prop} 包含不安全的表达式。`)
    }
    const parsed = valueParser(declaration.value)
    walkAssetFunctions(parsed.nodes, (url) => {
      const path = previewUrlToPath?.get(url) || url
      if (invalidCssUrl(path)) throw new Error(`CSS 资源路径不安全：${url}`)
      if (previewUrlToPath && !previewUrlToPath.has(url) && !previewUrlToPath.has(path)) {
        throw new Error(`CSS 引用了主题包中不存在的资源：${url}`)
      }
    })
  })
  return root.toString().trim()
}

function mapStringsDeep(value: unknown, replacements: Map<string, string>, key = ''): unknown {
  if (typeof value === 'string') {
    if (replacements.has(value)) return replacements.get(value)
    if (key === 'style' || key === 'cssText' || key === 'value' && value.includes('url(')) {
      try {
        return rewriteCssUrls(value, (url) => replacements.get(url) || url)
      } catch {
        return value
      }
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => mapStringsDeep(item, replacements, key))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, item]) => [childKey, mapStringsDeep(item, replacements, childKey)]),
    )
  }
  return value
}

function collectProjectUrls(value: unknown, urls: Set<string>, key = '') {
  if (typeof value === 'string') {
    if (/^(?:blob:|assets\/|\.\/assets\/)/.test(value)) urls.add(value)
    if (key === 'style' || key === 'cssText' || key === 'value' && value.includes('url(')) {
      try {
        const root = postcss.parse(`.x { value: ${value}; }`)
        root.walkDecls((declaration) => walkAssetFunctions(valueParser(declaration.value).nodes, (url) => urls.add(url)))
      } catch {
        // Invalid transient editor values are reported by validateThemeCss when exported as CSS.
      }
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectProjectUrls(item, urls, key)
    return
  }
  if (value && typeof value === 'object') {
    for (const [childKey, item] of Object.entries(value)) collectProjectUrls(item, urls, childKey)
  }
}

const DANGEROUS_PROJECT_KEYS = new Set([
  '__proto__', 'prototype', 'constructor', 'script', 'script-props', 'scriptProps',
  'scriptExport', 'script-export', 'javascript', 'event', 'events',
])

function validateProjectValue(value: unknown, depth: number, state: { nodes: number }, key = ''): unknown {
  if (depth > MAX_PROJECT_DEPTH) throw new Error('studio.json 工程嵌套层级过深')
  if (typeof value === 'string') {
    if (/<\s*script\b|javascript\s*:|data\s*:\s*text\/html/i.test(value)) {
      throw new Error(`studio.json 字段 ${key || 'value'} 包含不安全内容`)
    }
    return value
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => validateProjectValue(item, depth + 1, state, key))
  if (typeof value !== 'object') throw new Error('studio.json 包含不支持的数据类型')
  state.nodes++
  if (state.nodes > MAX_PROJECT_NODES) throw new Error('studio.json 工程对象数量过多')

  const result: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    if (DANGEROUS_PROJECT_KEYS.has(childKey) || /^on[a-z]/i.test(childKey)) {
      throw new Error(`studio.json 包含禁止字段：${childKey}`)
    }
    if (childKey === 'tagName' && typeof childValue === 'string' && /^(script|iframe|object|embed|base|form)$/i.test(childValue)) {
      throw new Error(`studio.json 包含禁止标签：${childValue}`)
    }
    if (childKey === 'attributes' && childValue && typeof childValue === 'object' && !Array.isArray(childValue)) {
      for (const [attribute, attributeValue] of Object.entries(childValue)) {
        if (/^on/i.test(attribute) || DANGEROUS_PROJECT_KEYS.has(attribute)) {
          throw new Error(`studio.json 包含禁止属性：${attribute}`)
        }
        if (typeof attributeValue === 'string' && /^(?:javascript|data\s*:\s*text\/html):/i.test(attributeValue.trim())) {
          throw new Error(`studio.json 属性 ${attribute} 包含不安全 URL`)
        }
      }
    }
    result[childKey] = validateProjectValue(childValue, depth + 1, state, childKey)
  }
  return result
}

export function validateStudioProjectData(value: unknown): ProjectData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('studio.json 工程结构无效')
  const project = validateProjectValue(value, 0, { nodes: 0 }) as Record<string, unknown>
  const pages = project.pages
  if (!Array.isArray(pages) || pages.length === 0 || pages.some((page) => !page || typeof page !== 'object')) {
    throw new Error('studio.json 缺少有效 pages')
  }
  for (const page of pages as Array<Record<string, unknown>>) {
    if (!Array.isArray(page.frames) || page.frames.length === 0) throw new Error('studio.json 缺少有效 frames')
    if (page.frames.some((frame) => !frame || typeof frame !== 'object' || !('component' in frame))) {
      throw new Error('studio.json frame 结构无效')
    }
  }
  return project as ProjectData
}

export function manifestFor(input: Omit<ExportThemeInput, 'projectData'>) {
  const manifest: Record<string, unknown> = {
    name: input.draft.name.trim(),
    id: input.draft.id.trim(),
  }
  if (input.draft.author.trim()) manifest.Author = input.draft.author.trim()
  if (input.draft.description.trim()) manifest.description = input.draft.description.trim()
  if (input.resources.font) manifest.font = input.resources.font
  if (input.resources.background) manifest.background = input.resources.background
  const icons = Object.fromEntries(
    RATING_KEYS.flatMap((key) => input.resources.icons[key] ? [[key, input.resources.icons[key]]] : []),
  )
  if (Object.keys(icons).length) manifest.icon = icons
  manifest.color = Object.fromEntries(DIFFICULTY_KEYS.map((key) => [key, input.draft.colors[key]]))
  manifest.css = 'b19.css'
  if (input.customTemplate.trim()) manifest.template = 'b19.art'
  return manifest
}

export function manifestYaml(input: Omit<ExportThemeInput, 'projectData'>) {
  return YAML.stringify(manifestFor(input), { lineWidth: 0 })
}

export function mapProjectAssetUrls(projectData: ProjectData, replacements: Map<string, string>) {
  return mapStringsDeep(projectData, replacements) as ProjectData
}

function normalizedTemplate(value: string) {
  return value.replace(/\r\n/g, '\n').trim()
}

const CUSTOM_CLASS_RE = /(^|[^A-Za-z0-9_-])\.?(phi-custom-(?:text|rect|circle|line|triangle|image)-[A-Za-z0-9_-]+)(?=$|[^A-Za-z0-9_-])/g

function referencedCustomClasses(selector: string) {
  return [...selector.matchAll(CUSTOM_CLASS_RE)].map((match) => match[2])
}

function cleanOrphanedCustomCss(css: string, projectData: ProjectData) {
  const liveClasses = collectCustomClassNames(projectData)
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    const referenced = referencedCustomClasses(rule.selector)
    if (referenced.length && referenced.some((className) => !liveClasses.has(className))) rule.remove()
  })
  return root.toString().trim()
}

function cleanOrphanedCustomProjectStyles(projectData: ProjectData) {
  const value = projectData as ProjectData & { styles?: unknown[] }
  if (!Array.isArray(value.styles)) return projectData
  const liveClasses = collectCustomClassNames(projectData)
  value.styles = value.styles.filter((style) => {
    if (!style || typeof style !== 'object') return true
    const record = style as { selectors?: unknown[]; selectorsAdd?: unknown }
    const selectors = [
      ...(Array.isArray(record.selectors) ? record.selectors : []),
      ...(typeof record.selectorsAdd === 'string' ? [record.selectorsAdd] : []),
    ]
    const referenced = selectors.flatMap((selector) => {
      if (typeof selector === 'string') return referencedCustomClasses(selector)
      if (selector && typeof selector === 'object' && 'name' in selector) {
        const name = (selector as { name?: unknown }).name
        return typeof name === 'string' ? referencedCustomClasses(name) : []
      }
      return []
    })
    return !referenced.length || referenced.every((className) => liveClasses.has(className))
  })
  return projectData
}

export function validateThemeTemplate(template: string, assetPaths: ReadonlySet<string>) {
  const safeTemplate = template.trimEnd()
  const normalized = safeTemplate.trim()
  if (!normalized) return ''
  if (new TextEncoder().encode(safeTemplate).byteLength > MAX_TEXT_SIZE) {
    throw new Error('b19.art 超过 5 MB')
  }

  const attributePattern = /\b(?:src|href|poster)\s*=\s*(["'])([\s\S]*?)\1/gi
  for (const match of normalized.matchAll(attributePattern)) {
    const value = match[2].trim()
    if (/^(?:blob|javascript|data\s*:\s*text\/html):/i.test(value)) {
      throw new Error(`b19.art 包含不可打包的资源 URL：${value}`)
    }
    const baseUrl = '{{themeInfo.baseUrl}}'
    if (!value.startsWith(baseUrl)) continue
    const path = value.slice(baseUrl.length)
    // Dynamic ArtTemplate expressions are opaque administrator source. Static
    // package references can still be checked against the files in this ZIP.
    if (/[{}]/.test(path)) continue
    if (!safeAssetPath(path)) {
      throw new Error(`b19.art 资源路径不安全：${path || '空路径'}`)
    }
    if (!assetPaths.has(path)) throw new Error(`b19.art 引用了主题包中不存在的资源：${path}`)
  }
  return safeTemplate
}

export function validateTheme(input: Omit<ExportThemeInput, 'projectData'>): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const id = input.draft.id.trim()
  if (!ID_RE.test(id)) {
    issues.push({ level: 'error', message: 'ID 需以小写字母开头，仅使用小写字母、数字、-、_' })
  } else if (RESERVED_IDS.has(id)) {
    issues.push({ level: 'error', message: `ID ${id} 与 phi-plugin 内置主题冲突` })
  } else {
    issues.push({ level: 'success', message: '主题 ID 可用' })
  }
  if (!input.draft.name.trim()) issues.push({ level: 'error', message: '主题名称不能为空' })
  else issues.push({ level: 'success', message: '主题元数据完整' })

  for (const key of DIFFICULTY_KEYS) {
    if (!COLOR_RE.test(input.draft.colors[key])) {
      issues.push({ level: 'error', message: `${key} 难度色不是有效的十六进制颜色` })
    }
  }
  const assetPaths = new Set(input.assets.map((asset) => asset.path))
  const references = [
    input.resources.background,
    input.resources.font,
    ...Object.values(input.resources.icons),
  ].filter((path): path is string => Boolean(path))
  for (const path of references) {
    if (!safeAssetPath(path)) issues.push({ level: 'error', message: `资源路径不安全：${path}` })
    else if (!assetPaths.has(path)) issues.push({ level: 'error', message: `缺少资源文件：${path}` })
  }
  const cssResources = new Map(input.assets.flatMap((asset) => [
    [asset.previewUrl, asset.path],
    [asset.path, asset.path],
    [`./${asset.path}`, asset.path],
  ]))
  try {
    validateThemeCss(input.css, cssResources)
    issues.push({ level: 'success', message: 'CSS 可解析且资源路径安全' })
  } catch (error) {
    issues.push({ level: 'error', message: error instanceof Error ? error.message : String(error) })
  }
  try {
    validateThemeTemplate(input.customTemplate, assetPaths)
  } catch (error) {
    issues.push({ level: 'error', message: error instanceof Error ? error.message : String(error) })
  }
  const bytes = input.assets.reduce((total, asset) => total + asset.bytes.byteLength, 0)
  if (bytes > MAX_ZIP_SIZE) issues.push({ level: 'error', message: '资源总大小超过 50 MB' })
  else if (bytes > 15 * 1024 * 1024) issues.push({ level: 'warning', message: '资源包超过 15 MB，Bot 首次渲染可能较慢' })
  if (input.customTemplate.trim()) {
    issues.push({ level: 'warning', message: '自定义 b19.art 将覆盖插件内置模板，请自行维护版本兼容性' })
  } else {
    issues.push({ level: 'success', message: '使用插件内置 B30 模板，可跟随上游结构更新' })
  }
  return issues
}

export async function exportThemePackage(input: ExportThemeInput) {
  const issues = validateTheme(input)
  const error = issues.find((issue) => issue.level === 'error')
  if (error) throw new Error(error.message)

  const urlToPath = new Map(input.assets.flatMap((asset) => [
    [asset.previewUrl, asset.path],
    [asset.path, asset.path],
    [`./${asset.path}`, asset.path],
  ]))
  const safeCss = validateThemeCss(input.css, urlToPath)
  const assetPaths = new Set(input.assets.map((asset) => asset.path))
  const safeTemplate = validateThemeTemplate(input.customTemplate, assetPaths)
  const safeProjectData = validateStudioProjectData(input.projectData)
  const projectData = cleanOrphanedCustomProjectStyles(
    mapStringsDeep(safeProjectData, urlToPath) as ProjectData,
  )
  const exportedCss = rewriteCssUrls(cleanOrphanedCustomCss(safeCss, projectData), (url) => urlToPath.get(url) || url)
  if (input.templateSource !== undefined) {
    const rebuiltTemplate = templateForProject(input.templateSource, projectData, assetPaths)
    if (normalizedTemplate(rebuiltTemplate) !== normalizedTemplate(safeTemplate)) {
      throw new Error('模板来源与最终 b19.art 不一致')
    }
  }
  const unresolvedProjectUrls = new Set<string>()
  collectProjectUrls(projectData, unresolvedProjectUrls)
  for (const url of unresolvedProjectUrls) {
    if (/^(?:blob:|\.\/assets\/)/.test(url)) throw new Error(`工程包含未打包的资源引用：${url}`)
  }
  const studioFile: StudioProjectFile = {
    schemaVersion: 1,
    generator: 'phi-theme-studio',
    draft: input.draft,
    resources: input.resources,
    css: exportedCss,
    ...(input.templateSource !== undefined ? { templateSource: input.templateSource } : {}),
    projectData,
  }

  const zip = new JSZip()
  const root = zip.folder(input.draft.id.trim())
  if (!root) throw new Error('无法创建主题包目录')
  root.file('info.yaml', manifestYaml(input))
  root.file('b19.css', `@import "../../b19.css";\n\n${DIFFICULTY_COLOR_CSS}\n\n${exportedCss}\n`)
  root.file('studio.json', JSON.stringify(studioFile, null, 2))
  if (safeTemplate) root.file('b19.art', `${safeTemplate}\n`)
  for (const asset of input.assets) root.file(asset.path, asset.bytes)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

function resolveRootPath(rootPrefix: string, path: string | undefined) {
  if (!path) return undefined
  const normalized = normalizePackagePath(path)
  return normalized ? `${rootPrefix}${normalized}` : undefined
}

export async function importThemePackage(file: File): Promise<ImportedTheme> {
  if (file.size > MAX_ZIP_SIZE) throw new Error('ZIP 文件超过 50 MB')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(zip.files).filter((entry) => !entry.dir) as ZipEntry[]
  if (entries.length > MAX_FILES) throw new Error(`主题包文件数超过 ${MAX_FILES}`)
  assertZipBudget(entries)
  for (const entry of entries) {
    const unsafeName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName
    const name = unsafeName || entry.name
    if (!safeAssetPath(name)) throw new Error(`ZIP 包含不安全路径：${name}`)
    if (!ALLOWED_EXTENSIONS.has(pathExtension(entry.name))) throw new Error(`不支持的文件类型：${entry.name}`)
  }
  const infoEntries = entries.filter((entry) => entry.name.endsWith('/info.yaml') || entry.name === 'info.yaml')
  if (infoEntries.length !== 1) throw new Error('主题包必须且只能包含一个 info.yaml')
  const infoEntry = infoEntries[0]
  const rootPrefix = infoEntry.name.slice(0, -'info.yaml'.length)
  if (rootPrefix && rootPrefix.split('/').filter(Boolean).length !== 1) throw new Error('主题包只能包含一个顶层主题目录')
  if (!rootPrefix && entries.some((entry) => entry.name.includes('/'))) {
    throw new Error('无顶层目录的主题包不能混入子目录文件')
  }
  for (const entry of entries) {
    if (!entry.name.startsWith(rootPrefix)) throw new Error(`ZIP 文件不在主题根目录内：${entry.name}`)
    const relative = entry.name.slice(rootPrefix.length)
    if (!normalizePackagePath(relative)) throw new Error(`ZIP 包含无效资源路径：${entry.name}`)
  }

  const budget = { total: 0 }
  const bytesCache = new Map<string, Uint8Array>()
  const readBytes = async (entry: ZipEntry, limit: number, label: string) => {
    const cached = bytesCache.get(entry.name)
    if (cached) return cached
    const bytes = await readEntryBytes(entry, limit, label, budget)
    bytesCache.set(entry.name, bytes)
    return bytes
  }
  const readText = async (entry: ZipEntry, limit: number, label: string) => new TextDecoder().decode(await readBytes(entry, limit, label))

  const rawManifest = manifestSchema.parse(YAML.parse(await readText(infoEntry, MAX_TEXT_SIZE, infoEntry.name)))
  for (const [key, value] of [['css', rawManifest.css], ['template', rawManifest.template]] as const) {
    if (value && !normalizePackagePath(value)) throw new Error(`info.yaml 包含不安全 ${key} 路径：${value}`)
  }
  const inferredId = rootPrefix.split('/').filter(Boolean).pop() || 'imported-theme'
  const id = rawManifest.id || inferredId
  if (!ID_RE.test(id) || RESERVED_IDS.has(id)) throw new Error(`info.yaml 中的主题 ID 不可用：${id}`)
  const warnings: string[] = []
  if (rootPrefix && inferredId !== id) warnings.push('ZIP 顶层目录与主题 ID 不一致，导出时会自动规范化。')

  const colors = { ...DEFAULT_DRAFT.colors }
  for (const key of DIFFICULTY_KEYS) {
    const value = rawManifest.color?.[key]
    if (typeof value === 'string' && COLOR_RE.test(value)) colors[key] = value
  }
  const draft: ThemeDraft = {
    id,
    name: rawManifest.name || id,
    author: rawManifest.Author || rawManifest.author || '',
    description: rawManifest.description || '',
    colors,
  }
  const resources: ThemeResources = { icons: {} }
  if (rawManifest.background) resources.background = rawManifest.background
  if (rawManifest.font) resources.font = rawManifest.font
  for (const key of RATING_KEYS) {
    const value = rawManifest.icon?.[key]
    if (typeof value === 'string') resources.icons[key] = value
  }
  for (const path of [resources.background, resources.font, ...Object.values(resources.icons)]) {
    if (path && !safeAssetPath(path)) throw new Error(`info.yaml 包含不安全资源路径：${path}`)
  }

  const runtimeNames = new Set([
    infoEntry.name,
    resolveRootPath(rootPrefix, rawManifest.css || 'b19.css'),
    resolveRootPath(rootPrefix, rawManifest.template),
    `${rootPrefix}studio.json`,
  ].filter((name): name is string => Boolean(name)))
  const assets: PackageAsset[] = []
  try {
    for (const entry of entries) {
      if (runtimeNames.has(entry.name)) continue
      const bytes = await readBytes(entry, MAX_FILE_SIZE, entry.name)
      const relativePath = entry.name.slice(rootPrefix.length)
      assets.push(hydrateAsset({ path: relativePath, mime: mimeFromPath(relativePath), bytes }))
    }

    const assetPaths = new Set(assets.map((asset) => asset.path))
    for (const path of [resources.background, resources.font, ...Object.values(resources.icons)]) {
      if (path && !assetPaths.has(path)) throw new Error(`主题包缺少 manifest 引用资源：${path}`)
    }

    const cssPath = resolveRootPath(rootPrefix, rawManifest.css || 'b19.css')
    const cssEntry = cssPath ? zip.file(cssPath) as ZipEntry | null : null
    const css = cssEntry ? cleanImportedCss(await readText(cssEntry, MAX_TEXT_SIZE, cssEntry.name)) : ''
    const cssAssets = new Map(assets.flatMap((asset) => [
      [asset.path, asset.path],
      [`./${asset.path}`, asset.path],
    ]))
    validateThemeCss(css, cssAssets)
    if (!cssEntry) warnings.push('主题包未包含 CSS，将从空白覆盖样式开始。')
    const templatePath = resolveRootPath(rootPrefix, rawManifest.template)
    const templateEntry = templatePath ? zip.file(templatePath) as ZipEntry | null : null
    let customTemplate = templateEntry ? await readText(templateEntry, MAX_TEXT_SIZE, templateEntry.name) : ''
    validateThemeTemplate(customTemplate, assetPaths)

    let projectData: ProjectData | undefined
    const studioEntry = zip.file(`${rootPrefix}studio.json`) as ZipEntry | null
    if (studioEntry) {
      try {
        const studio = JSON.parse(await readText(studioEntry, MAX_TEXT_SIZE, studioEntry.name)) as Partial<StudioProjectFile>
        if (studio.schemaVersion === 1 && studio.generator === 'phi-theme-studio' && studio.projectData) {
          if (typeof studio.css !== 'string' || validateThemeCss(studio.css) !== css) {
            throw new Error('studio.json 工程样式与 b19.css 不一致')
          }
          const safeProject = validateStudioProjectData(studio.projectData)
          if (studio.templateSource !== undefined) {
            if (typeof studio.templateSource !== 'string') throw new Error('studio.json 模板来源无效')
            const rebuiltTemplate = templateForProject(studio.templateSource, safeProject, assetPaths)
            if (normalizedTemplate(rebuiltTemplate) !== normalizedTemplate(customTemplate)) {
              throw new Error('studio.json 模板来源与 b19.art 不一致')
            }
            customTemplate = studio.templateSource
          }
          const pathToUrl = new Map(assets.map((asset) => [asset.path, asset.previewUrl]))
          projectData = mapStringsDeep(safeProject, pathToUrl) as ProjectData
        } else {
          warnings.push('studio.json 版本不兼容，已按普通主题包导入。')
        }
      } catch (error) {
        warnings.push(`studio.json 无法安全解析，已按普通主题包导入：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return { draft, resources, assets, css, customTemplate, projectData, warnings }
  } catch (error) {
    revokeAssets(assets)
    throw error
  }
}

export function cssForPreview(css: string, assets: PackageAsset[]) {
  const pathToUrl = new Map(assets.map((asset) => [asset.path, asset.previewUrl]))
  return rewriteCssUrls(css, (url) => pathToUrl.get(url.replace(/^\.\//, '')) || url)
}
