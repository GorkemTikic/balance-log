import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/balance-log/',   // 👈 THIS LINE is the important fix
})
