import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// Vite 多页应用配置：6 个页面各自独立入口，共享 src/ 下的样式与脚本
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        chat: resolve(__dirname, 'chat.html'),
        portfolio: resolve(__dirname, 'portfolio.html'),
        garden: resolve(__dirname, 'garden.html'),
        articles: resolve(__dirname, 'articles.html'),
        about: resolve(__dirname, 'about.html')
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
})
