// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { PREVIEW_MARKUP } from './preview'

const EXPECTED_TITLE_BY_COVER: Record<string, string> = {
  '01.png': 'ENERGY SYNERGY MATRIX',
  '02.png': 'Class Memories',
  '03.png': 'Artificial Existence',
  '04.png': 'Sultan Rage',
  '05.png': 'Snow Desert',
  '06.png': 'Indelible Scar',
}

describe('demo song artwork mapping', () => {
  it('pairs every score card with the title shown on its cover', () => {
    document.body.innerHTML = PREVIEW_MARKUP
    const cards = document.querySelectorAll('[data-phi-role="song-card"]')

    expect(cards).toHaveLength(36)
    for (const card of cards) {
      const image = card.querySelector<HTMLImageElement>('.ill img')
      const cover = image?.getAttribute('src')?.match(/covers\/(\d{2}\.png)$/)?.[1]
      const expectedTitle = cover ? EXPECTED_TITLE_BY_COVER[cover] : undefined

      expect(expectedTitle).toBeDefined()
      expect(card.querySelector('.songname p')?.textContent).toBe(expectedTitle)
      expect(image?.alt).toBe(expectedTitle)
    }
  })
})
