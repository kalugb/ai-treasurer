import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // Same origin as production (nginx does this in Docker/EC2): the browser only ever talks to this server, and /api is
  // forwarded to the backend. That keeps the session cookies first-party (SameSite=Lax) in every environment.
  server: { proxy: { '/api': { target: loadEnv(mode, '.', '').BACKEND_URL || 'http://localhost:8000' } } },
}))
