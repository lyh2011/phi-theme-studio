import { describe, expect, it } from 'vitest'
import { createShiftAwareSnapGuides } from './createEditor'

describe('shift precision dragging', () => {
  it('disables both snap axes while Shift is held and restores their thresholds', () => {
    const snap = createShiftAwareSnapGuides({ x: 8, y: 3 })

    expect(snap.guides).toEqual({ x: 8, y: 3 })
    snap.update(true)
    expect(snap.guides).toEqual({ x: 0, y: 0 })
    snap.update(false)
    expect(snap.guides).toEqual({ x: 8, y: 3 })
  })
})
