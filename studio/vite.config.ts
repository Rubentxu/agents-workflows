import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ReactFlow is ~200KB — isolate it
          if (id.includes('@xyflow') || id.includes('reactflow')) {
            return 'vendor-reactflow';
          }
          // Vendor chunk for react ecosystem
          if (id.includes('node_modules/react')) {
            return 'vendor-react';
          }
          // React Router
          if (id.includes('react-router') || id.includes('react-router-dom')) {
            return 'vendor-router';
          }
          // Zustand state
          if (id.includes('zustand')) {
            return 'vendor-state';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/mcp': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/metrics': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
