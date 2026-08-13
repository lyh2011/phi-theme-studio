// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT, DEFAULT_RESOURCES } from '../types/theme'
import {
  applyPreviewPage,
  applyRuntimePreview,
  DEFAULT_PREVIEW_OPTIONS,
  PREVIEW_MARKUP,
  PROTECTED_CSS,
  type PreviewOptions,
} from './preview'

function renderPreview() {
  document.body.innerHTML = PREVIEW_MARKUP
  return document
}

const hidden = (element: Element | null) => element?.hasAttribute('data-phi-preview-hidden') ?? true

describe('difficulty color preview', () => {
  it('keeps demo data styles low-specificity and out of editable markup', () => {
    expect(PROTECTED_CSS).toContain('/font/phi.ttf')
    expect(PREVIEW_MARKUP).toContain('class="average-marker"')
    expect(PREVIEW_MARKUP).not.toMatch(/\sstyle=/)
    expect(PROTECTED_CSS).toContain(':where(.average-marker) { bottom: 55%; }')
    expect(PROTECTED_CSS).toContain(':where(.histogram-slot:nth-child(30) .histogram-bar) { height: 12%; }')
  })

  it('uses difficulty variables for rank and info elements', () => {
    for (const key of ['AT', 'IN', 'HD', 'EZ'] as const) {
      expect(PROTECTED_CSS).toContain(`.rank-${key} { background-color: var(--${key}); }`)
      expect(PROTECTED_CSS).toContain(`background-color: color-mix(in srgb, var(--${key}) 30%, transparent);`)
      expect(PROTECTED_CSS).toContain(`border-color: var(--${key});`)
    }
  })

  it('updates runtime variables when the theme form draft changes', () => {
    const draft = {
      ...DEFAULT_DRAFT,
      colors: { ...DEFAULT_DRAFT.colors, IN: '#12ab34' },
    }

    applyRuntimePreview(document, draft, DEFAULT_RESOURCES, [])
    expect(document.querySelector('#phi-runtime-theme')?.textContent).toContain('--IN: #12ab34')

    applyRuntimePreview(document, {
      ...draft,
      colors: { ...draft.colors, IN: '#abcdef' },
    }, DEFAULT_RESOURCES, [])
    const runtimeCss = document.querySelector('#phi-runtime-theme')?.textContent || ''
    expect(runtimeCss).toContain('html:root')
    expect(runtimeCss).toContain('--IN: #abcdef')
    expect(runtimeCss).not.toContain('--IN: #12ab34')
  })

  it('lets an uploaded theme font override preview component fonts', () => {
    const resources = { ...DEFAULT_RESOURCES, font: 'assets/theme.ttf' }
    const assets = [{
      path: 'assets/theme.ttf',
      mime: 'font/ttf',
      bytes: new Uint8Array([0]),
      previewUrl: 'blob:theme-font',
    }]

    applyRuntimePreview(document, DEFAULT_DRAFT, resources, assets)
    const runtimeCss = document.querySelector('#phi-runtime-theme')?.textContent || ''
    expect(runtimeCss).toContain('@font-face { font-family: "phi-theme-preview"')
    expect(runtimeCss).toContain('body, body * { font-family: "phi-theme-preview"')
    expect(runtimeCss).toContain('!important')
  })
})

describe('conditional runtime elements', () => {
  const options = (overrides: Partial<PreviewOptions> = {}): PreviewOptions => ({
    ...DEFAULT_PREVIEW_OPTIONS,
    ...overrides,
  })

  it('ships every phi-plugin conditional block with a stable runtime selector', () => {
    for (const selector of ['.spInfoBox', '.accAvg', '.accAvgLine', '.cpToOld', '.Nosignal', '.tag-analysis-tip', '.tag-insufficient-message']) {
      expect(PREVIEW_MARKUP).toContain(`data-phi-selector="${selector}"`)
    }
    expect(PREVIEW_MARKUP).toContain('class="spInfo colorful-background clip-box"')
    expect(PREVIEW_MARKUP).toContain('border_corner_right_bottom')
    expect(PREVIEW_MARKUP).not.toMatch(/\sstyle=/)
  })

  it('honours the option toggles independently of the page filter', () => {
    const preview = renderPreview()

    applyPreviewPage(preview, 'analysis', options())
    expect(hidden(preview.querySelector('.spInfoBox'))).toBe(false)
    expect(hidden(preview.querySelector('.accAvg'))).toBe(false)
    expect(hidden(preview.querySelector('.cpToOld'))).toBe(true)
    expect(hidden(preview.querySelector('.Nosignal'))).toBe(true)

    applyPreviewPage(preview, 'analysis', options({ spInfo: false, cpToOld: true }))
    expect(hidden(preview.querySelector('.spInfoBox'))).toBe(true)
    expect(hidden(preview.querySelector('.cpToOld'))).toBe(false)
  })

  it('swaps the third Phi card for the no-signal placeholder', () => {
    const preview = renderPreview()
    const phiCard = () => preview.querySelector('.song[data-phi-slot="phi"][data-phi-index="3"]')

    applyPreviewPage(preview, 'b19', options())
    expect(hidden(phiCard())).toBe(false)
    expect(hidden(preview.querySelector('.Nosignal'))).toBe(true)

    applyPreviewPage(preview, 'b19', options({ nosignal: true }))
    expect(hidden(phiCard())).toBe(true)
    expect(hidden(preview.querySelector('.Nosignal'))).toBe(false)

    // B27 has no Phi slots at all, so the placeholder follows the same rule.
    applyPreviewPage(preview, 'b27', options({ nosignal: true }))
    expect(hidden(preview.querySelector('.Nosignal'))).toBe(true)
  })

  it('mirrors the runtime state classes of the analysis panels', () => {
    const preview = renderPreview()
    const row = preview.querySelector('.b30-analysis-row')
    const body = preview.querySelector('.tag-analysis-body')

    applyPreviewPage(preview, 'analysis', options())
    expect(row?.classList.contains('histogram-wide')).toBe(false)
    expect(body?.classList.contains('is-insufficient')).toBe(false)
    expect(hidden(preview.querySelector('.tag-analysis-tip'))).toBe(false)
    expect(hidden(preview.querySelector('.tag-insufficient-message'))).toBe(true)

    applyPreviewPage(preview, 'analysis', options({ tagInsufficient: true, histogramWide: true }))
    expect(row?.classList.contains('histogram-wide')).toBe(true)
    expect(body?.classList.contains('is-insufficient')).toBe(true)
    expect(hidden(preview.querySelector('.tag-analysis-panel'))).toBe(true)
    expect(hidden(preview.querySelector('.tag-analysis-tip'))).toBe(true)
  })

  it('leaves nested conditional blocks unreachable while their page section is hidden', () => {
    const preview = renderPreview()

    applyPreviewPage(preview, 'b19', options({ tagInsufficient: true }))
    expect(hidden(preview.querySelector('.b30-analysis-row'))).toBe(true)
    expect(preview.querySelector('.tag-insufficient-message')?.closest('[data-phi-preview-hidden]')).toBe(
      preview.querySelector('.b30-analysis-row'),
    )
  })
})
