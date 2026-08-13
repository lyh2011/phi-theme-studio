import { useEffect, useState } from 'react'

export { GUIDE_STEPS, type GuideBlock, type GuideStep } from './guideContent'

const SEEN_KEY = 'phi-theme-studio:guide-seen:v1'

/** Private-mode browsers can throw on storage access, so never let it break the app. */
function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // A guide that cannot remember being read is better than a crash.
  }
}

export function useFirstRunGuide() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!readSeen()) setOpen(true)
  }, [])

  const close = () => {
    markSeen()
    setOpen(false)
  }

  return { open, setOpen, close }
}
