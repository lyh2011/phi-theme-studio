import { defineConfig } from 'vite'
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
})
