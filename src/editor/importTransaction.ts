export interface ImportTransactionOptions<T> {
  load: () => Promise<T>
  isCurrent: () => boolean
  apply: (value: T) => void
  commit: (value: T) => void
  rollback: () => void
  discard: (value: T) => void
}

function bestEffort(callback: () => void) {
  try {
    callback()
  } catch {
    // Preserve the import failure; rollback and object URL cleanup are secondary.
  }
}

/** Apply imported editor data before exposing its matching React/ref state. */
export async function runImportTransaction<T>(options: ImportTransactionOptions<T>) {
  let loaded = false
  let retained = false
  let value: T

  try {
    value = await options.load()
    loaded = true
    if (!options.isCurrent()) return false

    try {
      options.apply(value)
    } catch (error) {
      bestEffort(options.rollback)
      throw error
    }

    if (!options.isCurrent()) {
      bestEffort(options.rollback)
      return false
    }

    try {
      options.commit(value)
      retained = true
    } catch (error) {
      bestEffort(options.rollback)
      throw error
    }
    return true
  } finally {
    if (loaded && !retained) bestEffort(() => options.discard(value))
  }
}
