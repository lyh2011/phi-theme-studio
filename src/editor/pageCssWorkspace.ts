import postcss from 'postcss'
import { normalizeRenderTarget, resolvePageCss } from '../lib/themePackage'
import type { PageCssMap, PageCssMetadata, RenderTarget, StudioPageState } from '../types/theme'

const EDITOR_WRAPPER_SELECTOR = '[data-gjs-type="wrapper"]'

function transformBodyChildren(css: string, toEditor: boolean) {
  if (!css.trim()) return css
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    rule.selectors = rule.selectors.map((selector) => toEditor
      ? selector.replace(
          /\bbody\s*>\s*(?!\[data-gjs-type=["']wrapper["']\]\s*>)/g,
          `body > ${EDITOR_WRAPPER_SELECTOR} > `,
        )
      : selector.replace(
          /\bbody\s*>\s*\[data-gjs-type=["']wrapper["']\]\s*>\s*/g,
          'body > ',
        ))
  })
  return root.toString()
}

/** Match runtime direct-child selectors against GrapesJS's transparent wrapper. */
export function cssForEditorCanvas(css: string) {
  return transformBodyChildren(css, true)
}

/** Remove the preview-only wrapper selector before persistence or export. */
export function cssFromEditorCanvas(css: string) {
  return transformBodyChildren(css, false)
}

export function pageCssPathsFromMetadata(metadata: readonly PageCssMetadata[]) {
  return Object.fromEntries(
    metadata.flatMap((entry) => entry.path ? [[entry.key, entry.path]] : []),
  ) as Record<string, string>
}

/**
 * Materialize an exact page entry only when an edit cannot safely update the
 * existing manifest entry. A short `app` fallback remains short for its
 * default `app/app` page, while edits to another template get an exact entry.
 */
export function materializePageCssEntry(
  cssByPage: PageCssMap,
  target: RenderTarget,
  css: string,
): PageCssMap {
  const resolved = resolvePageCss(cssByPage, target)
  if (resolved.css === undefined) return { ...cssByPage, [target]: css }
  if (resolved.metadata?.match !== 'fallback') return cssByPage
  if (normalizeRenderTarget(resolved.metadata.key) === target) return cssByPage
  return { ...cssByPage, [target]: css }
}

/** Apply editable canonical page states without changing manifest key shape. */
export function pageCssWithEditableStates(
  cssByPage: PageCssMap,
  states: Record<string, StudioPageState>,
): PageCssMap {
  return Object.fromEntries(Object.entries(cssByPage).map(([key, css]) => {
    const target = normalizeRenderTarget(key)
    return [key, target && states[target] ? states[target].css : css]
  }))
}

export function defaultStudioPageCssPath(key: string) {
  const target = normalizeRenderTarget(key)
  if (key === 'b19' || target === 'b19/b19') return 'b19.css'
  if (!key.includes('/')) return `${key}.css`
  const [app, template] = key.split('/', 2)
  return `pages/${app}-${template}.css`
}

export function pageCssPathsForExport(
  cssByPage: PageCssMap,
  preservedPaths: Record<string, string>,
) {
  return Object.fromEntries(Object.keys(cssByPage).map((key) => [
    key,
    preservedPaths[key] || defaultStudioPageCssPath(key),
  ])) as Record<string, string>
}

export function pageCssPathForTarget(
  cssByPage: PageCssMap,
  preservedPaths: Record<string, string>,
  target: RenderTarget,
) {
  const key = resolvePageCss(cssByPage, target).metadata?.key || target
  return preservedPaths[key] || defaultStudioPageCssPath(key)
}
