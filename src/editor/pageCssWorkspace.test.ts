import { describe, expect, it } from 'vitest'
import {
  cssForEditorCanvas,
  cssFromEditorCanvas,
  materializePageCssEntry,
  pageCssPathForTarget,
  pageCssPathsForExport,
  pageCssPathsFromMetadata,
  pageCssWithEditableStates,
} from './pageCssWorkspace'

describe('page CSS workspace', () => {
  it('keeps imported exact keys and root-level paths', () => {
    const cssByPage = {
      'b19/b19': '.song {}',
      'userinfo/userinfo': 'body { width: 1448px; }',
    }
    const paths = pageCssPathsFromMetadata([
      { target: 'b19/b19', key: 'b19/b19', match: 'exact', path: 'ocean.css' },
      { target: 'userinfo/userinfo', key: 'userinfo/userinfo', match: 'exact', path: 'userinfo.css' },
    ])
    const edited = pageCssWithEditableStates(cssByPage, {
      'userinfo/userinfo': { css: 'body { width: 1400px; }' },
    })

    expect(edited).toEqual({
      'b19/b19': '.song {}',
      'userinfo/userinfo': 'body { width: 1400px; }',
    })
    expect(pageCssPathsForExport(edited, paths)).toEqual({
      'b19/b19': 'ocean.css',
      'userinfo/userinfo': 'userinfo.css',
    })
    expect(pageCssPathForTarget(edited, paths, 'userinfo/userinfo')).toBe('userinfo.css')
  })

  it('does not materialize a page until it is edited', () => {
    const original = { 'b19/b19': '.song {}' }
    expect(pageCssWithEditableStates(original, {
      'help/help': { css: '' },
    })).toEqual(original)
    expect(materializePageCssEntry(original, 'help/help', '.help {}')).toEqual({
      ...original,
      'help/help': '.help {}',
    })
  })

  it('preserves a short fallback and adds an exact override for another template', () => {
    const original = { setting: '.panel { color: white; }' }
    expect(materializePageCssEntry(original, 'setting/setting', '.panel { color: red; }')).toBe(original)
    expect(materializePageCssEntry(original, 'setting/userSetting', '.panel { color: red; }')).toEqual({
      setting: '.panel { color: white; }',
      'setting/userSetting': '.panel { color: red; }',
    })
  })

  it('adapts runtime body children to the editor wrapper without exporting it', () => {
    const runtimeCss = [
      'body > .theme-background { display: block; }',
      'body > .theme-background img, body > .background:not(.theme-background) { display: none; }',
    ].join('\n')
    const editorCss = cssForEditorCanvas(runtimeCss)

    expect(editorCss).toContain('body > [data-gjs-type="wrapper"] > .theme-background')
    expect(cssFromEditorCanvas(editorCss)).toBe(runtimeCss)
  })
})
