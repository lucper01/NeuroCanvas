import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/NeuroCanvas/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'NeuroCanvas',
        short_name: 'NeuroCanvas',
        description: 'Scientific biosignal exploration and processing workbench',
        start_url: './',
        display: 'standalone',
        background_color: '#f6f5ef',
        theme_color: '#175b4b',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      }
    })
  ],
  build: { chunkSizeWarningLimit: 5000 }
})
