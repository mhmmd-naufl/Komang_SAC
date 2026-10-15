import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        // Harus sama dengan port uvicorn (8001). Port 8000 dipakai aplikasi
        // lain di mesin ini; kalau proxy dan backend beda port, request-nya
        // ditolak diam-diam dan gejalanya muncul sebagai "Not Found".
        target: 'http://localhost:8001',
        changeOrigin: true,
      }
    }
  }
})