export interface PageTransition<T> {
  previous: T
  next: T
  apply: (value: T) => void
}

function bestEffort(callback: () => void) {
  try {
    callback()
  } catch {
    // Preserve the original transition failure when rollback also fails.
  }
}

/** Apply the next page and restore the previous page if the editor rejects it. */
export function runPageTransition<T>({ previous, next, apply }: PageTransition<T>) {
  try {
    apply(next)
  } catch (error) {
    bestEffort(() => apply(previous))
    throw error
  }
}

export interface ProjectResetTransaction {
  drain: () => Promise<void>
  isCurrent: () => boolean
  apply: () => void
  clear: () => Promise<void>
  commit: () => void
  rollback: () => void
}

/** Reset the editor only after old saves drain, then expose the new state after persistence clears. */
export async function runProjectResetTransaction(options: ProjectResetTransaction) {
  await options.drain()
  if (!options.isCurrent()) return false

  let applyAttempted = false
  try {
    applyAttempted = true
    options.apply()
    if (!options.isCurrent()) {
      bestEffort(options.rollback)
      return false
    }

    await options.clear()
    if (!options.isCurrent()) {
      bestEffort(options.rollback)
      return false
    }

    options.commit()
    return true
  } catch (error) {
    if (applyAttempted) bestEffort(options.rollback)
    throw error
  }
}
