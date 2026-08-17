import { expect, test, type Frame, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

const PAGE_TABS = [
  '每日签到',
  '存档更新',
  '课题模式',
  'Arcaea 风格 B19',
  '推分建议',
  '定数表',
  '成绩列表',
  'B30 历史',
  '个人信息',
  '插件设置',
  '用户设置',
  '定数历史',
  '帮助',
  'B19 成绩图',
] as const

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('phi-theme-studio:guide-seen:v1', '1')
    indexedDB.deleteDatabase('keyval-store')
  })
})

test('component navigation and generated layers use Chinese UI names', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Arcaea 风格 B19', exact: true }).click()

  const navigationLabels = await page.locator('.component-nav-grid button span').allTextContents()
  expect(navigationLabels).toContain('玩家背景曲绘')
  expect(navigationLabels).toContain('曲绘图片')
  expect(navigationLabels.filter((label) => label.startsWith('.'))).toEqual([])

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const layerLabels = page.locator('#gjs-layer-manager .gjs-layer-name')
  await expect(layerLabels.first()).toHaveText('画布')
  const names = await layerLabels.allTextContents()
  expect(names).toContain('页面背景')
  expect(names).toContain('玩家背景曲绘')
  expect(names).toContain('RKS 整数部分')
  expect(names).not.toContain('Page background')
  expect(names).not.toContain('Player backdrop')
  expect(names).not.toContain('Box')
})

test('finite style properties use localized selects and export their CSS values', async ({ page }) => {
  await page.goto('/')
  const frame = await editorFrame(page)
  await page.getByRole('button', { name: '成绩卡', exact: true }).click()
  await expect(page.locator('.selection-path code')).toHaveText('.song')
  const overflow = page.locator('#gjs-style-manager .gjs-sm-property__overflow select')

  await expect(overflow).toHaveAttribute('aria-label', '溢出选项')
  await expect(overflow.locator('option')).toHaveText([
    '未设置（沿用页面样式）',
    '显示溢出内容（visible）',
    '隐藏溢出内容（hidden）',
    '直接裁切（clip）',
    '需要时滚动（auto）',
    '始终可滚动（scroll）',
  ])
  await overflow.selectOption('hidden')
  await expect(overflow).toHaveValue('hidden')
  await expect.poll(() => frame
    .locator('.song[data-phi-role="song-card"]:not([data-phi-preview-hidden])')
    .first()
    .evaluate((element) => getComputedStyle(element).overflow)).toBe('hidden')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const zip = await JSZip.loadAsync(await readFile(path!))
  const css = await zip.file('my-theme/b19.css')!.async('string')
  expect(css).toMatch(/\.song\s*\{[^}]*overflow:\s*hidden/i)
})

test('player backdrop exposes its clip-path as a shape control', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Arcaea 风格 B19', exact: true }).click()
  await page.getByRole('button', { name: '玩家背景曲绘', exact: true }).click()

  const shapeGroup = page.getByRole('group', { name: '玩家背景曲绘形状' })
  await expect(shapeGroup).toBeVisible()
  await expect(shapeGroup.getByRole('button', { name: '斜角', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  await shapeGroup.getByRole('button', { name: '长方形', exact: true }).click()
  await expect(shapeGroup.getByRole('button', { name: '长方形', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')

  const frame = await editorFrame(page)
  await expect.poll(() => frame.locator('.player_broad').evaluate((element) => getComputedStyle(element).clipPath))
    .toBe('none')
})

test('ordinary B30 cards expose artwork shape, fit long titles, and use two-decimal suggestions', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'B19 成绩图', exact: true }).click()
  await page.getByRole('tab', { name: 'B30', exact: true }).click()

  const frame = await editorFrame(page)
  await page.getByRole('button', { name: '曲绘图片', exact: true }).click()
  const shapeGroup = page.getByRole('group', { name: '曲绘形状' })
  await expect(shapeGroup).toBeVisible()
  await shapeGroup.getByRole('button', { name: '长方形', exact: true }).click()
  await expect.poll(() => frame
    .locator('.song[data-phi-role="song-card"]:not([data-phi-preview-hidden]) .ill')
    .first()
    .evaluate((element) => getComputedStyle(element).clipPath)).toBe('none')

  const longTitle = frame.locator('.songname p').filter({ hasText: 'Avataar' }).first()
  await expect.poll(() => longTitle.evaluate((element) => {
    const parent = element.parentElement!
    const style = getComputedStyle(element)
    return Number.parseFloat(style.fontSize) < 15
      && style.whiteSpace === 'nowrap'
      && element.scrollWidth <= parent.clientWidth + 0.5
  })).toBe(true)

  const suggestions = await frame.locator(
    '.song[data-phi-role="song-card"]:not([data-phi-preview-hidden]) .suggest p',
  ).allTextContents()
  expect(suggestions.filter((text) => text.trim().endsWith('%')))
    .toEqual(expect.arrayContaining([expect.stringMatching(/^\d+\.\d{2}%$/)]))
  expect(suggestions.filter((text) => text.trim().endsWith('%'))
    .every((text) => /^\d+\.\d{2}%$/.test(text.trim()))).toBe(true)
})

test('visiting pages does not materialize CSS entries and B19 custom elements stay compact', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')

  for (const tab of PAGE_TABS) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
  }
  await page.locator('.custom-nav-group button').filter({ hasText: '文字' }).first().click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()

  const zip = await JSZip.loadAsync(await readFile(path!))
  const studioEntry = zip.file('my-theme/studio.json')
  expect(studioEntry).not.toBeNull()
  const studioText = await studioEntry!.async('string')
  const studio = JSON.parse(studioText) as {
    projectData?: unknown
    pages: Record<string, { projectData?: unknown }>
  }
  expect(Buffer.byteLength(studioText)).toBeLessThan(100_000)
  expect(studio.projectData).toBeUndefined()
  expect(Object.keys(studio.pages)).toEqual(['b19/b19'])
  expect(studioText).toContain('data-phi-custom')
  expect(studioText).not.toContain('data-phi-role')

  const manifestEntry = zip.file('my-theme/info.yaml')
  expect(manifestEntry).not.toBeNull()
  const manifest = parse(await manifestEntry!.async('string')) as {
    css: Record<string, string>
  }
  expect(manifest.css).toEqual({ 'b19/b19': 'b19.css' })
  expect(zip.file('my-theme/pages/userinfo-userinfo.css')).toBeNull()

  await page.locator('input[type=file][accept*="zip"]').setInputFiles(path!)
  await expect(page.locator('.brand-block span')).toHaveText('my-theme')
  const frame = await editorFrame(page)
  await expect(frame.locator('[data-phi-custom]')).toHaveCount(1)
})

test('import keeps explicit root page CSS paths without adding visited pages', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await editorFrame(page)

  const source = new JSZip()
  source.file('root-css/info.yaml', [
    'name: Root CSS',
    'id: root-css',
    'css:',
    '  b19/b19: ocean.css',
    '  userinfo/userinfo: userinfo.css',
    '',
  ].join('\n'))
  source.file('root-css/ocean.css', '.song { color: #123456; }')
  source.file('root-css/userinfo.css', [
    'body { width: 1448px; height: 1086px; }',
    'body > .theme-background { background: #dcefff; }',
  ].join('\n'))
  const buffer = Buffer.from(await source.generateAsync({ type: 'uint8array' }))

  await page.locator('input[type=file][accept*="zip"]').setInputFiles({
    name: 'root-css.zip',
    mimeType: 'application/zip',
    buffer,
  })
  await expect(page.locator('.brand-block span')).toHaveText('root-css')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()
  await expect(page.locator('.preview-dimensions')).toHaveText('1448 x 1086')
  await page.getByTitle('主题源码').click()
  await expect(page.getByRole('button', { name: 'userinfo.css', exact: true })).toBeVisible()
  const sourceEditor = page.getByRole('textbox', { name: 'CSS 源码' })
  await sourceEditor.fill(`${await sourceEditor.inputValue()}\n.userinfo-page { opacity: 0.99; }`)
  await page.getByRole('button', { name: '应用', exact: true }).click()

  for (const tab of PAGE_TABS) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
  }

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const zip = await JSZip.loadAsync(await readFile(path!))
  const manifest = parse(await zip.file('root-css/info.yaml')!.async('string')) as {
    css: Record<string, string>
  }

  expect(manifest.css).toEqual({
    'b19/b19': 'ocean.css',
    'userinfo/userinfo': 'userinfo.css',
  })
  expect(zip.file('root-css/ocean.css')).not.toBeNull()
  const userinfoCss = await zip.file('root-css/userinfo.css')!.async('string')
  expect(userinfoCss).toContain('body > .theme-background')
  expect(userinfoCss).toContain('.userinfo-page')
  expect(userinfoCss).not.toContain('[data-gjs-type="wrapper"]')
  expect(Object.keys(zip.files).filter((name) => name.startsWith('root-css/pages/'))).toEqual([])
})

async function editorFrame(page: Page): Promise<Frame> {
  await expect.poll(async () => {
    const counts = await Promise.all(page.frames().map((frame) => frame.locator('[data-phi-selector]').count()))
    return counts.filter((count) => count > 0).length
  }).toBe(1)
  for (const frame of page.frames()) {
    if (await frame.locator('[data-phi-selector]').count()) return frame
  }
  throw new Error('Editor frame is unavailable')
}
