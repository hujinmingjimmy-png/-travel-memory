import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => ({
  define: mode === 'release' ? {
    'import.meta.env.VITE_AMAP_SECURITY_CODE': '""',
  } : {},
  plugins: [
    vue(),
    vueDevTools(),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  /**
   * 开发环境代理。
   *
   * Vue 开发服务器通常运行在：
   * http://localhost:5173
   *
   * Spring Boot 运行在：
   * http://localhost:8080
   *
   * 配置代理以后，前端只需要请求：
   * /api/auth/login
   *
   * Vite 会自动转发给：
   * http://localhost:8080/api/auth/login
   *
   * 这样开发阶段不需要先处理跨域问题。
   */
  server: {
    proxy: {
      // TRAVEL_SOCIAL_V12: forward authenticated websocket to Spring Boot
      '/ws': { target: 'ws://localhost:8080', ws: true, changeOrigin: true },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
}))
