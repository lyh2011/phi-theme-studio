import type { ProjectData } from 'grapesjs'

export const RATING_KEYS = ['NEW', 'F', 'C', 'B', 'A', 'S', 'V', 'FC', 'phi'] as const
export const DIFFICULTY_KEYS = ['AT', 'IN', 'HD', 'EZ'] as const

export type RatingKey = (typeof RATING_KEYS)[number]
export type DifficultyKey = (typeof DIFFICULTY_KEYS)[number]

/** Canonical render target used by the plugin (for example `setting/userSetting`). */
export const DEFAULT_RENDER_TARGET = 'b19/b19' as const
export type RenderTarget = string

/** CSS contents keyed by a plugin render target. Keys may be `app` or `app/template`. */
export type PageCssMap = Record<string, string>
export type ThemeCssMap = PageCssMap

export type PageCssMatch = 'exact' | 'fallback'

export interface PageCssMetadata {
  /** The requested canonical render target. */
  target: RenderTarget
  /** The manifest key that supplied the stylesheet. */
  key: string
  /** `exact` means `app/template`; `fallback` means the short `app` key. */
  match: PageCssMatch
  /** The package-relative stylesheet path (available when read from a package). */
  path?: string
}

export interface ThemeDraft {
  id: string
  name: string
  author: string
  description: string
  colors: Record<DifficultyKey, string>
}

export interface ThemeResources {
  background?: string
  font?: string
  icons: Partial<Record<RatingKey, string>>
}

/** Legacy single-CSS package shapes retained for import/export compatibility. */
export const EXPORT_MODES = ['override', 'standalone'] as const
export type ExportMode = (typeof EXPORT_MODES)[number]
export const DEFAULT_EXPORT_MODE: ExportMode = 'override'

export interface PackageAsset {
  path: string
  mime: string
  bytes: Uint8Array
  previewUrl: string
}

/** Persisted editor state for one render target in studio schema v2. */
export interface StudioPageState {
  css: string
  projectData?: ProjectData
  templateSource?: string
  /** The final template is retained for imports that do not have editable source. */
  customTemplate?: string
  dirty?: boolean
}

/** Short aliases used by integrations that refer to page state generically. */
export type PageState = StudioPageState
export type ThemePageState = StudioPageState

export interface StudioProjectFile {
  schemaVersion: 1 | 2
  generator: 'phi-theme-studio'
  draft: ThemeDraft
  resources: ThemeResources
  /** v1 stores one B19 stylesheet; v2 stores the per-page source map. */
  css: string | PageCssMap
  exportMode?: ExportMode
  templateSource?: string
  projectData?: ProjectData
  pages?: Record<RenderTarget, StudioPageState>
}

export interface ImportedTheme {
  draft: ThemeDraft
  resources: ThemeResources
  assets: PackageAsset[]
  /** Legacy-compatible B19 override resolved from b19/b19 or the b19 short key. */
  css: string
  /** Per-page author CSS, keyed by the original exact/short manifest keys. */
  cssByPage: PageCssMap
  /** v2 editor states keyed by canonical render target. */
  pages?: Record<RenderTarget, StudioPageState>
  /** Alias retained for callers that call these page projects. */
  pageProjects?: Record<RenderTarget, StudioPageState>
  pageCssMetadata: PageCssMetadata[]
  exportMode: ExportMode
  customTemplate: string
  projectData?: ProjectData
  warnings: string[]
}

export interface ValidationIssue {
  level: 'error' | 'warning' | 'success'
  message: string
}

export const DEFAULT_DRAFT: ThemeDraft = {
  id: 'my-theme',
  name: '未命名主题',
  author: '',
  description: '',
  colors: {
    AT: '#6e6e6e',
    IN: '#e23b3b',
    HD: '#169ac4',
    EZ: '#55a86b',
  },
}

export const DEFAULT_RESOURCES: ThemeResources = { icons: {} }
