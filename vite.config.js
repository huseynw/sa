import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false, // Disable source maps in production
    minify: 'terser',       // Terser ilə kodu sıx minify et
    terserOptions: {
      compress: {
        drop_console: true, // console.log-ları sil
        drop_debugger: true,
      },
      mangle: {
        toplevel: true, // Top-level dəyişən adlarını dəyiş
      },
      format: {
        comments: false, // Bütün kommentləri sil
      },
    },
    rollupOptions: {
      output: {
        // Fayl adlarını hash ilə gizlət
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
  // Dev modunda da source map-ları deaktiv et
  css: {
    devSourcemap: false,
  },
})

