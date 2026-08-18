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
    if (!sessionStorage.getItem('phi-theme-studio:e2e-db-reset')) {
      sessionStorage.setItem('phi-theme-studio:e2e-db-reset', '1')
      indexedDB.deleteDatabase('keyval-store')
    }
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

test('personal info rating cards use the imported S icon resource', async ({ page }) => {
  await page.goto('/')
  await editorFrame(page)

  const source = new JSZip()
  source.file('rating-info/info.yaml', [
    'name: Rating Info',
    'id: rating-info',
    'icon:',
    '  S: icons/S.png',
    '',
  ].join('\n'))
  source.file('rating-info/icons/S.png', await readFile('public/demo/rating/S.png'))
  const buffer = Buffer.from(await source.generateAsync({ type: 'uint8array' }))

  await page.locator('input[type=file][accept*="zip"]').setInputFiles({
    name: 'rating-info.zip',
    mimeType: 'application/zip',
    buffer,
  })
  await expect(page.locator('.brand-block span')).toHaveText('rating-info')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()

  const frame = await editorFrame(page)
  const infoIcons = frame.locator('.one-stats-box .Rating img[data-rating="S"]')
  await expect(infoIcons).toHaveCount(4)
  const sources = await infoIcons.evaluateAll((icons) =>
    icons.map((icon) => (icon as HTMLImageElement).src),
  )
  expect(new Set(sources).size).toBe(1)
  expect(sources[0]).toMatch(/^blob:/)
})

test('Alt-dragging a personal info difficulty card isolates its stable selector', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()

  let frame = await editorFrame(page)
  const readTranslations = (targetFrame: Frame) => targetFrame
    .locator('.one-stats-box')
    .evaluateAll((elements) => elements.map((element) => {
      const value = getComputedStyle(element).translate
      const values = value === 'none' ? [] : value.match(/-?(?:\d+\.?\d*|\.\d+)px/g) || []
      return {
        rank: (element as HTMLElement).dataset.rank,
        x: Number.parseFloat(values[0] || '0') || 0,
        y: Number.parseFloat(values[1] || '0') || 0,
      }
    }))
  const cards = frame.locator('.one-stats-box')
  await expect(cards).toHaveCount(4)
  await expect(cards.first()).toBeVisible()

  // The component navigator resolves the shared visual entry to the first
  // (EZ) card. Dragging the toolbar move handle then preserves that selection
  // even though the card contains many selectable descendants.
  await page.getByRole('tab', { name: '组件', exact: true }).click()
  await page.locator('.component-nav button[title=".one-stats-box"]').click()
  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')
  const moveHandle = page.locator('.gjs-toolbar-item[draggable="true"]')
  await expect(moveHandle).toHaveCount(1)
  await expect(moveHandle).toBeVisible()
  const handle = await moveHandle.boundingBox()
  expect(handle).not.toBeNull()
  const before = await readTranslations(frame)

  // Start with focus inside the iframe so clicking the external toolbar also
  // exercises the cross-document modifier tracker.
  await frame.evaluate(() => window.focus())
  await page.keyboard.down('Alt')
  try {
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle!.x + handle!.width / 2 + 64, handle!.y + handle!.height / 2 + 32, { steps: 8 })
    await page.mouse.up()
  } finally {
    await page.keyboard.up('Alt')
  }

  await expect(page.locator('.topbar-status')).toHaveAttribute('title', /有未保存改动|保存中/)
  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存', { timeout: 10_000 })

  const after = await readTranslations(frame)
  const byRank = new Map(after.map((card) => [card.rank, card]))
  const beforeByRank = new Map(before.map((card) => [card.rank, card]))
  const ezBefore = beforeByRank.get('EZ')!
  const ezAfter = byRank.get('EZ')!
  expect(Math.abs(ezAfter.x - ezBefore.x) + Math.abs(ezAfter.y - ezBefore.y)).toBeGreaterThan(8)
  for (const rank of ['HD', 'IN', 'AT']) {
    const initial = beforeByRank.get(rank)!
    const current = byRank.get(rank)!
    expect(current.x, `${rank} translate-x`).toBeCloseTo(initial.x, 1)
    expect(current.y, `${rank} translate-y`).toBeCloseTo(initial.y, 1)
  }

  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await readTranslations(frame))[0].x).toBeCloseTo(ezAfter.x + 1, 1)
  const nudged = await readTranslations(frame)
  expect(nudged.slice(1)).toEqual(after.slice(1))

  await page.getByTitle('撤销').click()
  await expect.poll(() => readTranslations(frame)).toEqual(after)
  await page.getByTitle('撤销').click()
  await expect.poll(() => readTranslations(frame)).toEqual(before)
  await page.getByTitle('重做').click()
  await expect.poll(() => readTranslations(frame)).toEqual(after)
  await page.getByTitle('重做').click()
  await expect.poll(() => readTranslations(frame)).toEqual(nudged)
  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')

  await page.getByRole('tab', { name: '插件设置', exact: true }).click()
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()
  frame = await editorFrame(page)
  await expect(frame.locator('.one-stats-box').first()).toBeVisible()
  await expect.poll(() => readTranslations(frame)).toEqual(nudged)

  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')
  await page.reload()
  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()
  frame = await editorFrame(page)
  await expect(frame.locator('.one-stats-box').first()).toBeVisible()
  await expect.poll(() => readTranslations(frame)).toEqual(nudged)
  await page.getByRole('tab', { name: '组件', exact: true }).click()
  await page.locator('.component-nav button[title=".one-stats-box"]').click()
  await expect(page.locator('.selection-path code')).toHaveText('.stats-box .one-stats-box:nth-child(1)')
  await expect(page.locator('.override-reset')).toBeEnabled()

  await page.getByTitle('主题源码').click()
  const sourceEditor = page.getByRole('textbox', { name: 'CSS 源码' })
  await expect.poll(() => sourceEditor.inputValue()).toMatch(
    /\.stats-box \.one-stats-box:nth-child\(1\)\s*\{[^}]*translate:/i,
  )
  const css = await sourceEditor.inputValue()
  expect(css).not.toMatch(/\.one-stats-box\s*\{[^}]*translate:/i)
  expect(css).not.toMatch(/#[a-z0-9_-]+\s*\{[^}]*translate:/i)
})

test('layer visibility and trash controls keep template edits exportable', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await editorFrame(page)

  const source = new JSZip()
  source.file('visibility-info/info.yaml', [
    'name: Visibility Info',
    'id: visibility-info',
    'css:',
    '  userinfo/userinfo: userinfo.css',
    '',
  ].join('\n'))
  source.file('visibility-info/userinfo.css', 'body .Player_data_line-right .Player_data_value { color: #1768ad; }')
  const buffer = Buffer.from(await source.generateAsync({ type: 'uint8array' }))

  await page.locator('input[type=file][accept*="zip"]').setInputFiles({
    name: 'visibility-info.zip',
    mimeType: 'application/zip',
    buffer,
  })
  await expect(page.locator('.brand-block span')).toHaveText('visibility-info')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()
  let frame = await editorFrame(page)
  const targetSelector = '.Player_data_line-right .Player_data_value'
  const target = frame.locator(`[data-phi-selector="${targetSelector}"]`)
  await expect(target).toBeVisible()

  // Selecting first opens the relevant branch in the layer tree.
  await page.getByRole('tab', { name: '组件', exact: true }).click()
  await page.getByRole('button', { name: '段位信息区域', exact: true }).click()
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const eye = page.locator(
    `.gjs-layer:has(> .gjs-layer-item .gjs-layer-title-inn[title="段位信息区域"]) > .gjs-layer-item [data-toggle-visible]`,
  ).last()
  await expect(eye).toBeVisible()
  await eye.click()
  await expect.poll(() => computedStyle(frame, targetSelector, 'display')).toBe('none')
  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')

  await page.getByTitle('主题源码').click()
  const sourceEditor = page.getByRole('textbox', { name: 'CSS 源码' })
  await expect.poll(() => sourceEditor.inputValue()).toContain('phi-theme-studio-visibility-')
  const hiddenCss = await sourceEditor.inputValue()
  expect(hiddenCss).toContain('phi-theme-studio-visibility-')
  expect(hiddenCss).toMatch(/\.Player_data_line-right \.Player_data_value\s*\{[^}]*display:\s*none\s*!important/i)
  expect(hiddenCss).not.toMatch(/#[i][a-z0-9]{4,}\s*\{[^}]*display/i)
  await page.getByRole('button', { name: '取消', exact: true }).click()

  // Restore it before selecting the canvas toolbar target for the separate
  // trash-button assertion; a hidden canvas node has no visible toolbar.
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await eye.click()
  await expect.poll(() => computedStyle(frame, targetSelector, 'display')).not.toBe('none')
  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')
  await page.getByTitle('主题源码').click()
  const restoredSourceEditor = page.getByRole('textbox', { name: 'CSS 源码' })
  await expect.poll(() => restoredSourceEditor.inputValue()).not.toMatch(/\.Player_data_line-right \.Player_data_value\s*\{[^}]*display:\s*none/i)
  const restoredCss = await restoredSourceEditor.inputValue()
  expect(restoredCss).not.toMatch(/\.Player_data_line-right \.Player_data_value\s*\{[^}]*display:\s*none/i)
  await page.getByRole('button', { name: '取消', exact: true }).click()

  // The toolbar trash action hides fixed template nodes and is undoable.
  await page.getByRole('tab', { name: '组件', exact: true }).click()
  await page.getByRole('button', { name: '段位信息区域', exact: true }).click()
  await page.locator('.gjs-toolbar-item').last().click()
  await expect.poll(() => computedStyle(frame, targetSelector, 'display')).toBe('none')
  await page.getByTitle('撤销').click()
  await expect.poll(() => computedStyle(frame, targetSelector, 'display')).not.toBe('none')
  await page.getByTitle('重做').click()
  await expect.poll(() => computedStyle(frame, targetSelector, 'display')).toBe('none')

  // Custom elements remain real removable project nodes.
  await page.getByRole('tab', { name: 'B19 成绩图', exact: true }).click()
  await page.getByRole('tab', { name: '组件', exact: true }).click()
  await page.getByRole('button', { name: '文字', exact: true }).click()
  frame = await editorFrame(page)
  await expect(frame.locator('[data-phi-custom="text"]')).toHaveCount(1)
  await page.locator('.gjs-toolbar-item').last().click()
  await expect(frame.locator('[data-phi-custom="text"]')).toHaveCount(0)
})

test('personal info text and layout controls override imported page selectors', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await editorFrame(page)

  const source = new JSZip()
  source.file('specific-info/info.yaml', [
    'name: Specific Info',
    'id: specific-info',
    'css:',
    '  userinfo/userinfo: userinfo.css',
    '',
  ].join('\n'))
  source.file('specific-info/userinfo.css', [
    'body .left { width: 590px !important; }',
    'body .Player_data_line-left .Player_data_value p { font-size: 28px !important; }',
    'body .Challenge span { font-size: 22px !important; }',
    'body #Challenge2 { width: 150px !important; }',
    'body .Player_profile_box p {',
    '  font-size: 19px !important;',
    '  line-height: 1.45 !important;',
    '}',
  ].join('\n'))
  const buffer = Buffer.from(await source.generateAsync({ type: 'uint8array' }))

  await page.locator('input[type=file][accept*="zip"]').setInputFiles({
    name: 'specific-info.zip',
    mimeType: 'application/zip',
    buffer,
  })
  await expect(page.locator('.brand-block span')).toHaveText('specific-info')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()
  let frame = await editorFrame(page)
  await expect(frame.locator('.userinfo-page')).toBeVisible()
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('590px')

  await setNumberStyle(page, '.left', 'width', 700)
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('700px')
  const widthInput = page.locator('.gjs-sm-property__width input').first()
  await widthInput.fill('')
  await widthInput.dispatchEvent('change')
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('590px')
  await page.getByTitle('撤销').click()
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('700px')
  await page.getByTitle('重做').click()
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('590px')
  await page.getByTitle('撤销').click()
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('700px')

  await setNumberStyle(
    page,
    '.Player_data_line-left .Player_data_value p',
    'font-size',
    41,
    true,
  )
  await expect.poll(() => computedStyle(
    frame,
    '.Player_data_line-left .Player_data_value p',
    'font-size',
  )).toBe('41px')

  await setNumberStyle(page, '.Challenge span', 'font-size', 37, true)
  await expect.poll(() => computedStyle(frame, '.Challenge span', 'font-size')).toBe('37px')

  await setNumberStyle(page, '.Challenge', 'width', 123)
  await expect.poll(() => computedStyle(frame, '.Challenge', 'width')).toBe('123px')

  await setNumberStyle(page, '.Player_profile_box p', 'font-size', 44, true)
  await expect.poll(() => computedStyle(frame, '.Player_profile_box p', 'font-size')).toBe('44px')
  await page.locator('.override-reset').click()
  await expect.poll(() => computedStyle(frame, '.Player_profile_box p', 'font-size')).toBe('19px')
  await page.getByTitle('撤销').click()
  await expect.poll(() => computedStyle(frame, '.Player_profile_box p', 'font-size')).toBe('44px')
  await page.getByTitle('重做').click()
  await expect.poll(() => computedStyle(frame, '.Player_profile_box p', 'font-size')).toBe('19px')
  await page.getByTitle('撤销').click()
  await expect.poll(() => computedStyle(frame, '.Player_profile_box p', 'font-size')).toBe('44px')
  await expect(page.locator('.topbar-status')).toHaveAttribute(
    'title',
    /有未保存改动|保存中/,
  )

  await page.getByTitle('主题源码').click()
  const sourceEditor = page.getByRole('textbox', { name: 'CSS 源码' })
  await expect(sourceEditor).toHaveValue(/\.left\s*\{/)
  const exportedCss = await sourceEditor.inputValue()
  expect(exportedCss).toContain('.phi-theme-studio-override-')
  expect(exportedCss).toMatch(/:root:is\(#phi-theme-studio-override-0,\s*:root\)/)
  expect(exportedCss).toMatch(/:is\(#phi-theme-studio-override-7,\s*:root\) \.left/)
  expect(exportedCss).toMatch(/\.left\s*\{[^}]*width:\s*700px\s*!important/i)
  expect(exportedCss).toMatch(/\.Player_profile_box p\s*\{[^}]*font-size:\s*44px\s*!important/i)
  expect(exportedCss).not.toMatch(/!important\s*!important/i)
  await page.getByRole('button', { name: '取消', exact: true }).click()

  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')
  await page.reload()
  await expect(page.locator('.brand-block span')).toHaveText('specific-info')
  await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()
  frame = await editorFrame(page)
  await expect(frame.locator('.userinfo-page')).toBeVisible()
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('700px')
  await expect.poll(() => computedStyle(frame, '.Player_profile_box p', 'font-size')).toBe('44px')
})

test('manual canvas zoom survives personal info element edits', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('tab', { name: '个人信息', exact: true }).click()

  const frame = await editorFrame(page)
  await expect(frame.locator('.userinfo-page')).toBeVisible()

  // Move far enough above the automatic fit cap that a regression which
  // re-fits after every revision cannot pass by coincidence.
  const zoomIn = page.getByTitle('放大')
  await expect(zoomIn).toBeEnabled()
  for (let index = 0; index < 8; index += 1) await zoomIn.click()
  const zoomReadout = page.locator('.zoom-readout')
  await expect(zoomReadout).toHaveText(/^(?:9\d|1\d\d|[2-9]\d\d)%$/)
  const manualZoom = await zoomReadout.textContent()
  expect(manualZoom).toMatch(/^\d+%$/)

  await setNumberStyle(page, '.left', 'width', 701)
  await expect.poll(() => computedStyle(frame, '.left', 'width')).toBe('701px')
  await expect(page.locator('.topbar-status')).toHaveAttribute(
    'title',
    '已自动保存',
    { timeout: 10_000 },
  )
  await expect(zoomReadout).toHaveText(manualZoom!)
})

async function setNumberStyle(
  page: Page,
  selector: string,
  property: string,
  value: number,
  typography = false,
) {
  await page.locator(`.component-nav button[title="${selector}"]`).click()
  await expect(page.locator('.selection-path code')).toHaveText(selector)
  await expect(page.locator('#gjs-style-manager')).toHaveAttribute(
    'data-phi-style-selector',
    selector,
  )
  if (typography) {
    const sector = page.locator('.gjs-sm-sector__phi-typography')
    const fields = sector.locator('.gjs-sm-properties')
    if (!(await fields.isVisible())) await sector.locator('.gjs-sm-sector-title').click()
  }
  const control = page.locator(`.gjs-sm-property__${property}`)
  await expect(control).toHaveAttribute('data-phi-computed-value', /\S/)
  const unit = control.locator('select.gjs-input-unit')
  if (await unit.count()) await unit.selectOption('px')
  const input = control.locator('input').first()
  await input.fill(String(value))
  await input.dispatchEvent('change')
}

async function computedStyle(frame: Frame, selector: string, property: string) {
  return frame.locator(selector).first().evaluate((element, name) => (
    getComputedStyle(element).getPropertyValue(name).trim()
  ), property)
}

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
