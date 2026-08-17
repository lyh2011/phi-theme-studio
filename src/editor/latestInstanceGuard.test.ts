import { describe, expect, it } from 'vitest'
import { createLatestInstanceGuard } from './latestInstanceGuard'

describe('latest instance guard', () => {
  it('invalidates async work when its instance is disposed', () => {
    const guard = createLatestInstanceGuard<object>()
    const editor = {}
    const pending = guard.activate(editor)

    expect(pending.isCurrent()).toBe(true)
    expect(guard.dispose(editor)).toBe(true)
    expect(pending.isCurrent()).toBe(false)
  })

  it('keeps the replacement current when a stale instance disposes late', () => {
    const guard = createLatestInstanceGuard<object>()
    const firstEditor = {}
    const secondEditor = {}
    const firstRestore = guard.activate(firstEditor)
    const secondRestore = guard.activate(secondEditor)

    expect(firstRestore.isCurrent()).toBe(false)
    expect(secondRestore.isCurrent()).toBe(true)
    expect(guard.dispose(firstEditor)).toBe(false)
    expect(secondRestore.isCurrent()).toBe(true)
    expect(guard.dispose(secondEditor)).toBe(true)
    expect(secondRestore.isCurrent()).toBe(false)
  })

  it('invalidates pending work when the owner unmounts', () => {
    const guard = createLatestInstanceGuard<object>()
    const pending = guard.activate({})

    guard.invalidate()

    expect(pending.isCurrent()).toBe(false)
  })
})
