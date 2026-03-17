import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change this to your GitHub repo name when deploying
// e.g., if repo is https://github.com/username/receipt-dashboard
// set base: '/receipt-dashboard/'
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
