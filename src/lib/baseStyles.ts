import baseB19Css from '../theme/base-b19.css?raw'

export const GENERATED_BASE_STYLES_START = 'phi-theme-studio:base-styles:start'
export const GENERATED_BASE_STYLES_END = 'phi-theme-studio:base-styles:end'

// phi-plugin resolves a theme stylesheet from resources/html/b19/themes/<id>/,
// so the shared stylesheet sits three levels up. This mirrors how the bundled
// `milthm` theme reaches common.css when it ships its own complete styles.
export const STANDALONE_COMMON_IMPORT = '@import "../../../common/common.css";'

/** The phi-plugin base stylesheet without its own relative common.css import. */
export function baseStyleBody() {
  return baseB19Css.replace(/@import\s+[^;]+;/g, '').trim()
}

/**
 * Inline the phi-plugin base stylesheet so the theme renders without depending
 * on the plugin's current b19.css. The markers let an import strip the block
 * back out and recover the author's own overrides.
 */
export function inlinedBaseStyles() {
  return [
    `/* ${GENERATED_BASE_STYLES_START} */`,
    baseStyleBody(),
    `/* ${GENERATED_BASE_STYLES_END} */`,
  ].join('\n')
}
