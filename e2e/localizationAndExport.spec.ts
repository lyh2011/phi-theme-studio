import { expect, test, type Frame, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'

const PAGE_TABS = [
  '每日签到',
  '存档更新',
  '课题模式',
  'Arcaea 风格 B19',
  '推分建议',
  '定数表',
  '成绩列表',
  'B30 历史',
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

test('a visited multi-page project exports a compact studio file and imports its custom element', async ({ page }) => {
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
  expect(Object.keys(studio.pages)).toHaveLength(13)
  expect(studioText).toContain('data-phi-custom')
  expect(studioText).not.toContain('data-phi-role')

  await page.locator('input[type=file][accept*="zip"]').setInputFiles(path!)
  await expect(page.locator('.brand-block span')).toHaveText('my-theme')
  const frame = await editorFrame(page)
  await expect(frame.locator('[data-phi-custom]')).toHaveCount(1)
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
