import { delMany, get, set } from 'idb-keyval'
import type { ProjectData } from 'grapesjs'
import type {
  ExportMode,
  PageCssMap,
  PackageAsset,
  RenderTarget,
  StudioPageState,
  ThemeDraft,
  ThemeResources,
} from '../types/theme'

const DRAFT_KEY = 'phi-theme-studio:last-project:v2'
const LEGACY_DRAFT_KEY = 'phi-theme-studio:last-project:v1'

export interface PersistedProject {
  schemaVersion?: 1 | 2
  draft: ThemeDraft
  resources: ThemeResources
  assets: Omit<PackageAsset, 'previewUrl'>[]
  customTemplate: string
  exportMode?: ExportMode
  projectData: ProjectData
  /** Optional multi-page editor state; v1 callers can continue to ignore it. */
  cssByPage?: PageCssMap
  /** Original package paths for all manifest page styles. */
  cssPaths?: Record<string, string>
  pages?: Record<RenderTarget, StudioPageState>
}

export async function loadPersistedProject() {
  const current = await get<PersistedProject>(DRAFT_KEY)
  if (current) return current
  const legacy = await get<PersistedProject>(LEGACY_DRAFT_KEY)
  if (!legacy) return undefined
  // Keep the old draft available under the v2 key so subsequent loads do not
  // need to repeat the migration. The legacy record remains untouched until
  // the user explicitly clears the project.
  const migrated = { ...legacy, schemaVersion: legacy.schemaVersion || 1 as const }
  await set(DRAFT_KEY, migrated)
  return migrated
}

export function savePersistedProject(project: PersistedProject) {
  return set(DRAFT_KEY, { ...project, schemaVersion: project.schemaVersion || 2 })
}

export async function clearPersistedProject() {
  await delMany([DRAFT_KEY, LEGACY_DRAFT_KEY])
}
