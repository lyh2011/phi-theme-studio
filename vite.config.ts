import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

function normalizeBasePath(value: string | undefined) {
  const path = value?.trim()
  if (!path || path === '/') return '/'
  return `/${path.replace(/^\/+|\/+$/g, '')}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  plugins: [react()],
  test: {
    // The theme ships phi-plugin's stylesheet through `?raw` imports. Without
    // CSS processing Vitest stubs them out and the packaging tests would assert
    // against an empty base stylesheet.
    css: true,
  },
})
