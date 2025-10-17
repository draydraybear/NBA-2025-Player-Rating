// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/NBA-2526-Preseason-Player-Rating/',  // ← 你的 repo 名
  build: { outDir: 'docs' }                    // ← 產出到 docs
})
