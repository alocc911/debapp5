import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages we need assets to resolve under "/<repo-name>/".
// This config reads base from env (VITE_BASE). For local dev, it defaults to "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
})
