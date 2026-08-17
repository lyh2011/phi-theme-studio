import type { ProjectData } from 'grapesjs'
import type { PackageAsset, PageCssMap, StudioPageState } from '../types/theme'
import {
  collectCssAssetUrls,
  collectProjectAssetUrls,
  mapProjectAssetUrls,
  rewriteCssUrls,
} from '../lib/themePackage'

function referencesPath(urls: ReadonlySet<string>, path: string) {
  return urls.has(path) || urls.has(`./${path}`)
}

export function hydratePageAssetReferences(state: StudioPageState, assets: PackageAsset[]) {
  const pathToUrl = new Map<string, string>()
  for (const asset of assets) {
    pathToUrl.set(asset.path, asset.previewUrl)
    pathToUrl.set(`./${asset.path}`, asset.previewUrl)
  }
  return {
    ...state,
    css: rewriteCssUrls(state.css || '', (url) => pathToUrl.get(url) || url),
    ...(state.projectData
      ? { projectData: mapProjectAssetUrls(state.projectData, pathToUrl) }
      : {}),
  }
}

export function rewritePageAssetReferences<T extends Record<string, StudioPageState>>(
  states: T,
  replacements: Map<string, string>,
) {
  return Object.fromEntries(
    Object.entries(states).map(([target, state]) => [
      target,
      {
        ...state,
        css: rewriteCssUrls(state.css || '', (url) => replacements.get(url) || url),
        ...(state.projectData
          ? { projectData: mapProjectAssetUrls(state.projectData, replacements) }
          : {}),
      },
    ]),
  ) as T
}

export function rewriteCssMapAssetReferences(cssByPage: PageCssMap, replacements: Map<string, string>) {
  return Object.fromEntries(
    Object.entries(cssByPage).map(([target, css]) => [
      target,
      rewriteCssUrls(css, (url) => replacements.get(url) || url),
    ]),
  ) as PageCssMap
}

export function pageStatesReferenceAsset(states: Record<string, StudioPageState>, path: string) {
  return Object.values(states).some((state) => {
    if (referencesPath(collectCssAssetUrls(state.css || ''), path)) return true
    return Boolean(
      state.projectData && referencesPath(collectProjectAssetUrls(state.projectData as ProjectData), path),
    )
  })
}

export function cssMapReferencesAsset(cssByPage: PageCssMap, path: string) {
  return Object.values(cssByPage).some((css) => referencesPath(collectCssAssetUrls(css), path))
}
