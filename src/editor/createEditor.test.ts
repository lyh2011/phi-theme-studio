import { describe, expect, it } from 'vitest'
import {
  computedStylePlaceholder,
  createShiftAwareSnapGuides,
  normalizeStyleInputUnit,
  nudgeDelta,
  parseTranslatePair,
  STYLE_PROPERTY_NAMES,
} from './createEditor'

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

describe('style input units', () => {
  it('adds practical defaults to bare length and angle values', () => {
    expect(normalizeStyleInputUnit('margin', '12')).toBe('12px')
    expect(normalizeStyleInputUnit('padding', '1 2 -3 .5')).toBe('1px 2px -3px .5px')
    expect(normalizeStyleInputUnit('translate', '12, 18')).toBe('12px, 18px')
    expect(normalizeStyleInputUnit('rotate', '-7.5')).toBe('-7.5deg')
    expect(normalizeStyleInputUnit('transform-origin', '50 25')).toBe('50px 25px')
  })

  it('preserves explicit units and non-numeric CSS values', () => {
    expect(normalizeStyleInputUnit('margin', '2rem auto')).toBe('2rem auto')
    expect(normalizeStyleInputUnit('rotate', '0.5turn')).toBe('0.5turn')
    expect(normalizeStyleInputUnit('transform-origin', 'center top')).toBe('center top')
  })
})

describe('computed translate parsing', () => {
  it('treats an omitted axis as zero instead of repeating the first one', () => {
    // Browsers serialize `translate: 12px 0px` back as `12px`.
    expect(parseTranslatePair('12px')).toEqual([12, 0])
    expect(parseTranslatePair('12px 0px')).toEqual([12, 0])
    expect(parseTranslatePair('-4.5px 8px')).toEqual([-4.5, 8])
  })

  it('falls back to no movement for empty and non-numeric values', () => {
    expect(parseTranslatePair('none')).toEqual([0, 0])
    expect(parseTranslatePair(undefined)).toEqual([0, 0])
    expect(parseTranslatePair('auto auto')).toEqual([0, 0])
  })
})

describe('arrow key nudging', () => {
  it('moves one pixel per press and ten while Shift is held', () => {
    expect(nudgeDelta('ArrowLeft', false)).toEqual([-1, 0])
    expect(nudgeDelta('ArrowRight', false)).toEqual([1, 0])
    expect(nudgeDelta('ArrowUp', true)).toEqual([0, -10])
    expect(nudgeDelta('ArrowDown', true)).toEqual([0, 10])
  })

  it('ignores keys that are not arrows', () => {
    expect(nudgeDelta('Enter', false)).toBeUndefined()
    expect(nudgeDelta('a', true)).toBeUndefined()
  })
})

describe('computed style defaults', () => {
  it('covers every style control exactly once', () => {
    expect(STYLE_PROPERTY_NAMES).toHaveLength(39)
    expect(new Set(STYLE_PROPERTY_NAMES)).toHaveLength(39)
    expect(STYLE_PROPERTY_NAMES).toEqual(expect.arrayContaining([
      'width', 'height', 'color', 'font-size', 'fill', 'stroke', 'translate', 'scale',
    ]))
  })

  it('uses unitless placeholders for number controls', () => {
    expect(computedStylePlaceholder('15px', 'number', ['px', 'rem'])).toBe('15')
    expect(computedStylePlaceholder('1.25rem', 'number', ['px', 'rem'])).toBe('1.25')
  })

  it('keeps keywords, unsupported units, and regular values intact', () => {
    expect(computedStylePlaceholder('auto', 'number', ['px'])).toBe('auto')
    expect(computedStylePlaceholder('50%', 'number', ['px'])).toBe('50%')
    expect(computedStylePlaceholder('rgb(255, 255, 255)', 'color')).toBe('rgb(255, 255, 255)')
  })
})
