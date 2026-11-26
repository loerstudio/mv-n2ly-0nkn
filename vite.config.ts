import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from a sub-path (/<repo>/), so everything is relative to BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        id: base,
        name: 'Mattana Vita',
        short_name: 'Mattana Vita',
        description: 'Your Life Navigation. One destination. Stay on route.',
        lang: 'it',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#04060c',
        theme_color: '#04060c',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5175 },
});
