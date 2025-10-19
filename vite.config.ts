import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use relative asset URLs so the app runs from any subpath (e.g. /<repo>/ on GitHub Pages)
export default defineConfig({
  plugins: [react()],
  base: './',
})
