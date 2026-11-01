import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the packaged app can load dist/index.html over file://
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // Monaco is bundled locally now (no CDN); it lives in its own long-cacheable chunk.
    chunkSizeWarningLimit: 4500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'monaco', test: /node_modules[\\/]monaco-editor/, priority: 30 },
            { name: 'xterm', test: /node_modules[\\/]xterm/, priority: 20 },
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})
