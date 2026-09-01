import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages project pages need this set to '/repo-name/' (via the
  // VITE_BASE_PATH env var at build time); a custom domain or user/org page
  // deploy should leave it at the default root path. See SETUP.md.
  base: process.env.VITE_BASE_PATH || '/',
})
