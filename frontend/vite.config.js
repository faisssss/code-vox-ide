import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The backend only accepts this port, so fail clearly instead of moving to another.
  server: { port: 5173, strictPort: true },
})
