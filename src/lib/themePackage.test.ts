import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import YAML from 'yaml'
import {
  exportThemePackage,
  importThemePackage,
  rewriteCssUrls,
  validateTheme,
  validateThemeCss,
} from './themePackage'
import { DEFAULT_DRAFT, DEFAULT_RESOURCES, type PackageAsset } from '../types/theme'

const projectData = {
  pages: [{ frames: [{ component: { type: 'wrapper', components: [] } }] }],
  styles: [],
}

describe('theme package validation', () => {
  it('accepts a minimal CSS override theme', () => {
    const issues = validateTheme({
      draft: DEFAULT_DRAFT,
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: '.song { border-radius: 4px; }',
      customTemplate: '',
    })
    expect(issues.some((issue) => issue.level === 'error')).toBe(false)
    expect(issues.some((issue) => issue.message.includes('内置 B30 模板'))).toBe(true)
  })

  it('rejects reserved ids and remote CSS resources', () => {
    const issues = validateTheme({
      draft: { ...DEFAULT_DRAFT, id: 'default' },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: '.song { background: url("https://example.com/a.png"); }',
      customTemplate: '',
    })
    expect(issues.filter((issue) => issue.level === 'error')).toHaveLength(2)
    expect(() => validateThemeCss('@import "https://example.com/a.css";')).toThrow(/不能包含 @import/)
    expect(() => validateThemeCss('.song { background: u\\72l(\\68ttps\\3a//example.com/a.png); }')).toThrow(/不安全/)
    expect(() => validateThemeCss('.song { background: image-set("https://example.com/a.png" 1x); }')).toThrow(/不安全/)
    expect(() => validateThemeCss('#i390l { color: red; }')).toThrow(/临时 ID/)
  })

  it('rewrites only parsed url values', () => {
    const css = '.song { background: url("blob:test"); content: "blob:test"; }'
    expect(rewriteCssUrls(css, (url) => url === 'blob:test' ? 'assets/bg.png' : url)).toContain('url("assets/bg.png")')
    expect(rewriteCssUrls(css, (url) => url)).toContain('content: "blob:test"')
  })
})

describe('theme package round trip', () => {
  it('exports a directly extractable package and imports it again', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71])
    const asset: PackageAsset = {
      path: 'assets/background.png',
      mime: 'image/png',
      bytes,
      previewUrl: 'blob:background',
    }
    const draft = { ...DEFAULT_DRAFT, id: 'round-trip', name: 'Round Trip', author: 'Tester' }
    const resources = { ...DEFAULT_RESOURCES, background: asset.path }
    const blob = await exportThemePackage({
      draft,
      resources,
      assets: [asset],
      css: '.song { border-radius: 3px; }',
      customTemplate: '',
      projectData,
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(zip.file('round-trip/info.yaml')).toBeTruthy()
    expect(zip.file('round-trip/b19.css')).toBeTruthy()
    expect(zip.file('round-trip/studio.json')).toBeTruthy()
    expect(zip.file('round-trip/assets/background.png')).toBeTruthy()

    const yaml = YAML.parse(await zip.file('round-trip/info.yaml')!.async('string'))
    expect(yaml).toMatchObject({ id: 'round-trip', name: 'Round Trip', Author: 'Tester', css: 'b19.css' })
    const css = await zip.file('round-trip/b19.css')!.async('string')
    expect(css).toMatch(/^@import "\.\.\/\.\.\/b19\.css";/)

    const imported = await importThemePackage(new File([blob], 'round-trip.zip', { type: 'application/zip' }))
    expect(imported.draft.id).toBe('round-trip')
    expect(imported.resources.background).toBe('assets/background.png')
    expect(imported.assets[0].bytes).toEqual(bytes)
    expect(imported.css).toContain('border-radius: 3px')
    for (const importedAsset of imported.assets) URL.revokeObjectURL(importedAsset.previewUrl)
  })

  it('rejects zip traversal names', async () => {
    const zip = new JSZip()
    zip.file('../info.yaml', 'id: unsafe\nname: Unsafe')
    const blob = await zip.generateAsync({ type: 'blob' })
    await expect(importThemePackage(new File([blob], 'unsafe.zip'))).rejects.toThrow(/不安全路径/)
  })

  it('rejects files outside the detected theme root', async () => {
    const zip = new JSZip()
    zip.file('safe/info.yaml', 'id: safe\nname: Safe')
    zip.file('outside/image.png', new Uint8Array([1]))
    const blob = await zip.generateAsync({ type: 'blob' })
    await expect(importThemePackage(new File([blob], 'mixed-root.zip'))).rejects.toThrow(/不在主题根目录/)
  })

  it('ignores studio projects with scripts and falls back to package CSS', async () => {
    const zip = new JSZip()
    zip.file('safe/info.yaml', 'id: safe\nname: Safe\ncss: b19.css')
    zip.file('safe/b19.css', '@import "../../b19.css";\n.song { color: red; }')
    zip.file('safe/studio.json', JSON.stringify({
      schemaVersion: 1,
      generator: 'phi-theme-studio',
      css: '.song { color: red; }',
      projectData: {
        pages: [{ frames: [{ component: { type: 'wrapper', script: 'alert(1)' } }] }],
      },
    }))
    const blob = await zip.generateAsync({ type: 'blob' })
    const imported = await importThemePackage(new File([blob], 'unsafe-studio.zip'))
    expect(imported.projectData).toBeUndefined()
    expect(imported.css).toContain('color: red')
    expect(imported.warnings.join(' ')).toMatch(/禁止字段/)
  })

  it('rejects declared files that exceed the uncompressed budget', async () => {
    const zip = new JSZip()
    zip.file('large/info.yaml', 'id: large\nname: Large')
    zip.file('large/large.png', new Uint8Array(20 * 1024 * 1024 + 1))
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    await expect(importThemePackage(new File([blob], 'large.zip'))).rejects.toThrow(/解压后超过限制/)
  })
})
