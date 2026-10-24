import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Base path for hosting under a sub-path such as GitHub Pages
// (https://<user>.github.io/<repo>/). Set BASE_PATH=/<repo>/ when building.
// Accepts "/repo", "/repo/", "repo" or "./"; defaults to "/".
function normalizeBase(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (value === '' || value === '/') return '/'
  if (value.startsWith('.')) return value.endsWith('/') ? value : `${value}/`
  const withLeading = value.startsWith('/') ? value : `/${value}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: normalizeBase(process.env.BASE_PATH),
  plugins: [react()],
})
