import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 路徑需與 repo 名稱完全一致（前後都有 /）
  base: '/NBA-2025-Player-Rating/',
})
