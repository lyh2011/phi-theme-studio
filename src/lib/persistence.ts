import { del, get, set } from 'idb-keyval'
import type { ProjectData } from 'grapesjs'
import type { PackageAsset, ThemeDraft, ThemeResources } from '../types/theme'

const DRAFT_KEY = 'phi-theme-studio:last-project:v1'

export interface PersistedProject {
  draft: ThemeDraft
  resources: ThemeResources
  assets: Omit<PackageAsset, 'previewUrl'>[]
  customTemplate: string
  projectData: ProjectData
}

export function loadPersistedProject() {
  return get<PersistedProject>(DRAFT_KEY)
}

export function savePersistedProject(project: PersistedProject) {
  return set(DRAFT_KEY, project)
}

export function clearPersistedProject() {
  return del(DRAFT_KEY)
}
