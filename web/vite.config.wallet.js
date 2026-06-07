import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const NODE_URL = process.env.VITE_API_URL || 'http://localhost:8339'

const apiPaths = ['/info', '/utxos', '/tx', '/address']

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-wallet',
    rollupOptions: {
      input: 'wallet.html',
    },
  },
  server: {
    proxy: Object.fromEntries(
      apiPaths.map(p => [p, { target: NODE_URL, changeOrigin: true }])
    ),
  },
})
