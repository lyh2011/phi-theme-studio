import { describe, expect, it, vi } from 'vitest'
import { runPageTransition, runProjectResetTransaction } from './projectTransaction'

describe('page transition transaction', () => {
  it('restores the previous page when applying the next page fails', () => {
    const order: string[] = []

    expect(() => runPageTransition({
      previous: 'list/list',
      next: 'b19/b19',
      apply: (target) => {
        order.push(target)
        if (target === 'b19/b19') throw new Error('reset failed')
      },
    })).toThrow('reset failed')

    expect(order).toEqual(['b19/b19', 'list/list'])
  })
})

describe('new project transaction', () => {
  it('drains old saves before clearing persistence and committing state', async () => {
    const order: string[] = []

    await expect(runProjectResetTransaction({
      drain: async () => { order.push('drain') },
      isCurrent: () => true,
      apply: () => { order.push('apply') },
      clear: async () => { order.push('clear') },
      commit: () => { order.push('commit') },
      rollback: () => { order.push('rollback') },
    })).resolves.toBe(true)

    expect(order).toEqual(['drain', 'apply', 'clear', 'commit'])
  })

  it('rolls the editor back without clearing persistence when reset fails', async () => {
    const clear = vi.fn(async () => undefined)
    const commit = vi.fn()
    const rollback = vi.fn()

    await expect(runProjectResetTransaction({
      drain: async () => undefined,
      isCurrent: () => true,
      apply: () => { throw new Error('reset failed') },
      clear,
      commit,
      rollback,
    })).rejects.toThrow('reset failed')

    expect(rollback).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('rolls the editor back when clearing persistence fails', async () => {
    const commit = vi.fn()
    const rollback = vi.fn()

    await expect(runProjectResetTransaction({
      drain: async () => undefined,
      isCurrent: () => true,
      apply: () => undefined,
      clear: async () => { throw new Error('indexeddb failed') },
      commit,
      rollback,
    })).rejects.toThrow('indexeddb failed')

    expect(rollback).toHaveBeenCalledOnce()
    expect(commit).not.toHaveBeenCalled()
  })

  it('does not reset after a newer project operation supersedes it', async () => {
    const apply = vi.fn()
    const clear = vi.fn(async () => undefined)
    const commit = vi.fn()

    await expect(runProjectResetTransaction({
      drain: async () => undefined,
      isCurrent: () => false,
      apply,
      clear,
      commit,
      rollback: vi.fn(),
    })).resolves.toBe(false)

    expect(apply).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })
})
