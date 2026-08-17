import { expect, test, type Frame, type Page } from '@playwright/test'

const LARGE_PAGE_CASES = [
  ['Arcaea 风格 B19', '.box > .song_box'],
  ['推分建议', '.group_list > .group'],
  ['定数表', '.tableBox > .content'],
  ['B30 历史', '.main-box > .row'],
  ['帮助', '.help_box'],
] as const

test('a real autosaved multi-page draft reloads into B19 without persisting fixture DOM', async ({ browser }) => {
  test.setTimeout(90_000)
  const context = await browser.newContext({ viewport: { width: 1800, height: 1200 } })
  const page = await context.newPage()
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    localStorage.setItem('phi-theme-studio:guide-seen:v1', '1')
  })

  try {
    await page.goto('/')
    let frame = await findEditorFrame(page)
    const expectedPageCount = await page
      .getByRole('tablist', { name: '编辑页面' })
      .getByRole('tab')
      .count()
    await page.locator('.custom-nav-group button').filter({ hasText: '文字' }).first().click()
    await expect(frame.locator('[data-phi-custom="text"]')).toHaveCount(1)

    for (const [tab, readySelector] of LARGE_PAGE_CASES) {
      await page.getByRole('tab', { exact: true, name: tab }).click()
      await frame.locator(readySelector).first().waitFor({ state: 'visible' })
    }
    await expect.poll(async () => {
      const draft = await readPersistedDraft(page)
      return draft.containsFixedFixture ? -1 : draft.projectPageCount
    }).toBeGreaterThanOrEqual(LARGE_PAGE_CASES.length)
    await expect(page.locator('.topbar-status')).toHaveAttribute('title', '已自动保存')

    const persisted = await readPersistedDraft(page)
    expect(persisted.pageCount).toBe(expectedPageCount)
    expect(persisted.bytes).toBeLessThan(250_000)
    expect(persisted.containsCustomElement).toBe(true)
    expect(persisted.containsFixedFixture).toBe(false)

    await page.reload()
    frame = await findEditorFrame(page)
    await page.getByRole('tab', { exact: true, name: 'B19' }).click()
    await expect(frame.locator('.song[data-phi-role="song-card"]:not([data-phi-preview-hidden])'))
      .toHaveCount(19)
    await expect(frame.locator('[data-phi-custom="text"]')).toHaveCount(1)
    await expect(frame.locator('.background img')).toHaveAttribute('src', '/demo/background.png')

    await page.getByRole('tab', { exact: true, name: 'Arcaea 风格 B19' }).click()
    await expect(frame.locator('.box > .song_box')).toHaveCount(33)
    await expect(frame.locator('.player_broad > img')).toHaveAttribute('src', '/demo/background.png')
    const mismatches = await frame.locator('.box > .song_box').evaluateAll((cards) =>
      cards.flatMap((card) => {
        const title = card.querySelector('.name p')?.textContent?.trim()
        const artwork = card.querySelector<HTMLImageElement>('.ill_box > img')
        return artwork?.alt === title ? [] : [{ artwork: artwork?.alt, title }]
      }),
    )
    expect(mismatches).toEqual([])
    expect(browserErrors).toEqual([])
  } finally {
    await context.close()
  }
})

async function findEditorFrame(page: Page): Promise<Frame> {
  await expect.poll(async () => {
    const counts = await Promise.all(
      page.frames().map((frame) => frame.locator('[data-phi-selector]').count()),
    )
    return counts.filter((count) => count > 0).length
  }).toBe(1)

  for (const frame of page.frames()) {
    if (await frame.locator('[data-phi-selector]').count()) return frame
  }
  throw new Error('Editor fixture frame did not become ready')
}

async function readPersistedDraft(page: Page) {
  return page.evaluate(async () => {
    const value = await new Promise<unknown>((resolve, reject) => {
      const open = indexedDB.open('keyval-store')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const database = open.result
        const transaction = database.transaction('keyval', 'readonly')
        const request = transaction.objectStore('keyval').get('phi-theme-studio:last-project:v2')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      }
    })
    const serialized = JSON.stringify(value) || ''
    const pages = (value as { pages?: Record<string, unknown> } | undefined)?.pages || {}
    return {
      bytes: new TextEncoder().encode(serialized).byteLength,
      containsCustomElement: serialized.includes('data-phi-custom'),
      containsFixedFixture: /data-phi-role|data-card-key|song_box|help_box/.test(serialized),
      pageCount: Object.keys(pages).length,
      projectPageCount: Object.values(pages).filter((page) => (
        page && typeof page === 'object' && 'projectData' in page
      )).length,
    }
  })
}
