export interface InstanceGeneration {
  isCurrent: () => boolean
}

export interface LatestInstanceGuard<T> {
  activate: (instance: T) => InstanceGeneration
  dispose: (instance: T) => boolean
  invalidate: () => void
}

/**
 * Tracks async work owned by the latest live instance. A late completion from
 * an older or disposed instance can use its token to avoid committing state.
 */
export function createLatestInstanceGuard<T>(): LatestInstanceGuard<T> {
  let active: T | undefined
  let generation = 0

  return {
    activate(instance) {
      active = instance
      const token = ++generation
      return {
        isCurrent: () => active === instance && generation === token,
      }
    },
    dispose(instance) {
      if (active !== instance) return false
      active = undefined
      generation += 1
      return true
    },
    invalidate() {
      active = undefined
      generation += 1
    },
  }
}
