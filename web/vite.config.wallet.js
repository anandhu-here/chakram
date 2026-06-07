import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiPaths = ['/info', '/utxos', '/tx', '/address']

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = (env.VITE_API_URL || '').replace(/\/$/, '')

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Explicitly bake the URL into the bundle at build time
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    build: {
      outDir: 'dist-wallet',
      rollupOptions: {
        input: 'wallet.html',
      },
    },
    server: {
      proxy: Object.fromEntries(
        apiPaths.map(p => [p, {
          target: apiUrl || 'http://localhost:8339',
          changeOrigin: true,
        }])
      ),
    },
  }
})
