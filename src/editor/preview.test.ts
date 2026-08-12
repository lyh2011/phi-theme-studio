// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT, DEFAULT_RESOURCES } from '../types/theme'
import { applyRuntimePreview, PREVIEW_MARKUP, PROTECTED_CSS } from './preview'

describe('difficulty color preview', () => {
  it('keeps demo data styles out of editable component ids', () => {
    expect(PREVIEW_MARKUP).not.toMatch(/\sstyle=/)
    expect(PROTECTED_CSS).toContain('.average-marker { bottom: 55%; }')
    expect(PROTECTED_CSS).toContain('.histogram-slot:nth-child(30) .histogram-bar { height: 12%; }')
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
})
