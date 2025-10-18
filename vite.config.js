// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/NBA-2025-Player-Rating/', // ← 你的 repo 名稱
})
