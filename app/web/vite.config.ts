import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Одна служба: на бою собранные страницы отдаёт FastAPI.
// В разработке — прокси на сервер, чтобы cookie ставилась на тот же адрес.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
