import { describe, expect, it } from 'vitest'
import type { Component } from 'grapesjs'
import {
  computedStylePlaceholder,
  clipPathForShape,
  colorPickerPopupPosition,
  createShiftAwareSnapGuides,
  normalizeStyleInputUnit,
  nudgeDelta,
  parseTranslatePair,
  repairBackgroundLayerStyle,
  repairBackgroundLayerValue,
  shapeControlTargetSelector,
  statsTableControlTargetSelector,
  statsRowOffsets,
  STYLE_PROPERTY_NAMES,
} from './createEditor'

function mockComponent(selector: string, classes: string[] = [], parent?: Component) {
  return {
    getAttributes: () => ({ 'data-phi-selector': selector }),
    getClasses: () => classes,
    parent: () => parent,
  } as unknown as Component
}

describe('parsed background layers', () => {
  it('replaces invalid initial items without splitting commas inside gradients', () => {
    expect(repairBackgroundLayerStyle({
      'background-image': 'linear-gradient(red, blue), url("blob:test"), initial',
      'background-position-x': 'initial, center, initial',
      'background-position-y': 'initial, top, initial',
      'background-size': 'initial, cover, initial',
      'background-repeat': 'initial, no-repeat, initial',
    })).toEqual({
      'background-image': 'linear-gradient(red, blue), url("blob:test"), none',
      'background-position-x': '0%, center, 0%',
      'background-position-y': '0%, top, 0%',
      'background-size': 'auto, cover, auto',
      'background-repeat': 'repeat, no-repeat, repeat',
    })
  })

  it('preserves a whole-property initial and valid layered values', () => {
    expect(repairBackgroundLayerValue('background-image', 'initial')).toBe('initial')
    expect(repairBackgroundLayerValue(
      'background-image',
      'linear-gradient(red, blue), url("blob:test"), none',
    )).toBe('linear-gradient(red, blue), url("blob:test"), none')
  })
})

describe('component shape modes', () => {
  it('switches clipped components between their native angle and a rectangle', () => {
    expect(clipPathForShape('rectangle', ['clip-box'])).toBe('none')
    expect(clipPathForShape('parallelogram', ['clip-box'])).toContain('var(--clipSlope)')
    expect(clipPathForShape('parallelogram', ['clip-box-left'])).toMatch(/^polygon\(100% 0, 100% 100%/)
  })

  it('provides aligned and staggered offsets for the statistics table', () => {
    expect(statsRowOffsets('orthogonal')).toEqual(['0', '0', '0', '0'])
    expect(statsRowOffsets('slanted')).toEqual([
      'calc(var(--row) * 3)',
      'calc(var(--row) * 2)',
      'calc(var(--row) * 1)',
      '0',
    ])
  })

  it('finds controls from selectable descendants instead of requiring the outer edge', () => {
    const recordInfo = mockComponent('.recordInfo', ['recordInfo', 'clip-box'])
    const sheet = mockComponent('.sheet', ['sheet'], recordInfo)
    const artwork = mockComponent('.ill', ['ill', 'clip-box'])
    const artworkImage = mockComponent('.ill img', [], artwork)
    const difficulty = mockComponent('.rank-IN', ['rank-IN', 'clip-box'])
    const difficultyText = mockComponent('.rank-IN .org p', [], difficulty)

    expect(shapeControlTargetSelector(sheet)).toBe('.recordInfo')
    expect(statsTableControlTargetSelector(sheet)).toBe('.recordInfo')
    expect(shapeControlTargetSelector(artworkImage)).toBe('.ill')
    expect(shapeControlTargetSelector(difficultyText)).toBe('.rank-IN')
    expect(shapeControlTargetSelector(mockComponent('.songname p'))).toBe('')
  })
})

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

describe('color picker positioning', () => {
  it('opens below and right-aligns with its trigger when there is room', () => {
    expect(colorPickerPopupPosition(
      { left: 1200, right: 1268, top: 530, bottom: 560 },
      { width: 194, height: 238 },
      { width: 1440, height: 1000 },
    )).toEqual({ left: 1074, top: 566 })
  })

  it('moves above low controls and remains inside a mobile viewport', () => {
    expect(colorPickerPopupPosition(
      { left: 350, right: 382, top: 780, bottom: 810 },
      { width: 236, height: 215 },
      { width: 390, height: 844 },
    )).toEqual({ left: 146, top: 559 })
  })
})
