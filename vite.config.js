import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/NBA-2526-Preseason-Player-Rating/', // ← 一定要和 repo 名稱一致
})
