import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const NODE_URL = 'http://localhost:8339'

const apiPaths = ['/info', '/block', '/blocks', '/address', '/utxos', '/tx', '/peers', '/faucet']

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: Object.fromEntries(
      apiPaths.map(p => [p, { target: NODE_URL, changeOrigin: true }])
    ),
  },
})
