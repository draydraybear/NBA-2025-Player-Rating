// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/NBA-2025-Player-Rating/',   // ★很重要（GH Pages 子路徑）
  build: { outDir: 'docs' }           // ★輸出到 docs，方便 Pages 直接吃
})
