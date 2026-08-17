import { describe, expect, it } from 'vitest'
import type { ProjectData } from 'grapesjs'
import {
  cssMapReferencesAsset,
  hydratePageAssetReferences,
  pageStatesReferenceAsset,
  rewriteCssMapAssetReferences,
  rewritePageAssetReferences,
} from './pageAssets'

function imageProject(src: string): ProjectData {
  return {
    pages: [{
      frames: [{
        component: {
          type: 'wrapper',
          components: [{
            tagName: 'img',
            attributes: { src },
          }],
        },
      }],
    }],
    styles: [],
  }
}

describe('page asset references', () => {
  it('canonicalizes blob URLs in every page CSS and project snapshot', () => {
    const rewritten = rewritePageAssetReferences({
      'b19/b19': {
        css: '.custom { background-image: url("blob:old-image"); }',
        projectData: imageProject('blob:old-image'),
      },
      'list/list': {
        css: '.line { mask-image: url("blob:old-image"); }',
      },
    }, new Map([['blob:old-image', 'assets/custom/image.png']]))

    expect(rewritten['b19/b19'].css).toContain('url("assets/custom/image.png")')
    expect(JSON.stringify(rewritten['b19/b19'].projectData)).toContain('assets/custom/image.png')
    expect(rewritten['list/list'].css).toContain('url("assets/custom/image.png")')
  })

  it('hydrates a replaced path with the new blob URL in CSS and project data', () => {
    const previousPath = 'assets/custom/image.png'
    const nextPath = 'assets/custom/image.webp'
    const canonical = rewritePageAssetReferences({
      active: {
        css: '.custom { background-image: url("blob:old-image"); }',
        projectData: imageProject('blob:old-image'),
      },
    }, new Map([['blob:old-image', previousPath]]))
    const migrated = rewritePageAssetReferences(
      canonical,
      new Map([[previousPath, nextPath]]),
    )
    const hydrated = hydratePageAssetReferences(migrated.active, [{
      path: nextPath,
      mime: 'image/webp',
      bytes: new Uint8Array([1]),
      previewUrl: 'blob:new-image',
    }])

    expect(hydrated.css).toContain('url("blob:new-image")')
    expect(JSON.stringify(hydrated.projectData)).toContain('blob:new-image')
    expect(JSON.stringify(hydrated)).not.toContain('blob:old-image')
  })

  it('detects direct references in page CSS, project data, and passthrough CSS', () => {
    const path = 'assets/background.png'
    expect(pageStatesReferenceAsset({
      'b19/b19': { css: '', projectData: imageProject(path) },
    }, path)).toBe(true)
    expect(pageStatesReferenceAsset({
      'b19/b19': { css: '.song { background: none; }' },
    }, path)).toBe(false)
    expect(cssMapReferencesAsset({ future: `.box { background: url("./${path}"); }` }, path)).toBe(true)
  })

  it('migrates asset paths inside unsupported page styles', () => {
    const rewritten = rewriteCssMapAssetReferences(
      { future: '.box { background: url("assets/background.png"); }' },
      new Map([['assets/background.png', 'assets/background.webp']]),
    )
    expect(rewritten.future).toContain('url("assets/background.webp")')
  })
})
