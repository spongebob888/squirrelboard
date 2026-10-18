import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [vue()],
    server: {
      proxy: {
        '/api/v1': {
          target: env.SHADOWQUIC_API_URL || 'http://127.0.0.1:9090',
          changeOrigin: true,
          timeout: 65000,
          proxyTimeout: 65000,
        },
      },
    },
  }
})
