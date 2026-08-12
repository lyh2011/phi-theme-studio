import type { ProjectData } from 'grapesjs'

export const RATING_KEYS = ['NEW', 'F', 'C', 'B', 'A', 'S', 'V', 'FC', 'phi'] as const
export const DIFFICULTY_KEYS = ['AT', 'IN', 'HD', 'EZ'] as const

export type RatingKey = (typeof RATING_KEYS)[number]
export type DifficultyKey = (typeof DIFFICULTY_KEYS)[number]

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

export interface PackageAsset {
  path: string
  mime: string
  bytes: Uint8Array
  previewUrl: string
}

export interface StudioProjectFile {
  schemaVersion: 1
  generator: 'phi-theme-studio'
  draft: ThemeDraft
  resources: ThemeResources
  css: string
  projectData: ProjectData
}

export interface ImportedTheme {
  draft: ThemeDraft
  resources: ThemeResources
  assets: PackageAsset[]
  css: string
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
