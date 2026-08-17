import { describe, expect, it, vi } from 'vitest'
import { runImportTransaction } from './importTransaction'

function callbacks() {
  return {
    apply: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    discard: vi.fn(),
  }
}

describe('import transaction', () => {
  it('does not apply or commit when package loading fails', async () => {
    const actions = callbacks()

    await expect(runImportTransaction({
      ...actions,
      load: async () => { throw new Error('invalid package') },
      isCurrent: () => true,
    })).rejects.toThrow('invalid package')

    expect(actions.apply).not.toHaveBeenCalled()
    expect(actions.commit).not.toHaveBeenCalled()
    expect(actions.rollback).not.toHaveBeenCalled()
    expect(actions.discard).not.toHaveBeenCalled()
  })

  it('rolls back and discards staged data when editor reset fails', async () => {
    const actions = callbacks()
    actions.apply.mockImplementation(() => { throw new Error('reset failed') })
    const imported = { id: 'incoming-theme' }

    await expect(runImportTransaction({
      ...actions,
      load: async () => imported,
      isCurrent: () => true,
    })).rejects.toThrow('reset failed')

    expect(actions.rollback).toHaveBeenCalledOnce()
    expect(actions.discard).toHaveBeenCalledWith(imported)
    expect(actions.commit).not.toHaveBeenCalled()
  })

  it('checks generation again after applying before it commits', async () => {
    const actions = callbacks()
    let current = true
    actions.apply.mockImplementation(() => { current = false })
    const imported = { id: 'superseded-theme' }

    await expect(runImportTransaction({
      ...actions,
      load: async () => imported,
      isCurrent: () => current,
    })).resolves.toBe(false)

    expect(actions.rollback).toHaveBeenCalledOnce()
    expect(actions.discard).toHaveBeenCalledWith(imported)
    expect(actions.commit).not.toHaveBeenCalled()
  })

  it('commits only after the editor apply succeeds', async () => {
    const order: string[] = []
    const imported = { id: 'incoming-theme' }

    await expect(runImportTransaction({
      load: async () => imported,
      isCurrent: () => true,
      apply: () => order.push('apply'),
      commit: () => order.push('commit'),
      rollback: () => order.push('rollback'),
      discard: () => order.push('discard'),
    })).resolves.toBe(true)

    expect(order).toEqual(['apply', 'commit'])
  })

  it('rolls back if the final commit callback itself fails', async () => {
    const actions = callbacks()
    actions.commit.mockImplementation(() => { throw new Error('commit failed') })

    await expect(runImportTransaction({
      ...actions,
      load: async () => ({ id: 'incoming-theme' }),
      isCurrent: () => true,
    })).rejects.toThrow('commit failed')

    expect(actions.rollback).toHaveBeenCalledOnce()
    expect(actions.discard).toHaveBeenCalledOnce()
  })
})
