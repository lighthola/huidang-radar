import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { route } from './proxy/handlers.js';

// 開發環境：把共用 proxy 路由掛成 Vite 中介層（取代舊的 dev-proxy.js）
const apiProxyPlugin = {
  name: 'api-proxy',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && req.url.startsWith('/api/')) {
        if (route(req, res)) return;
        // 未匹配的 /api 路徑：回乾淨 404（與 Vercel function 一致），
        // 避免 fall through 到 SPA fallback 回傳 index.html(200 HTML)
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [
    vue(),
    apiProxyPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '回檔雷達',
        short_name: '回檔雷達',
        description: '台股回檔追蹤 — 距 3 年高點的回檔幅度與下一關卡',
        lang: 'zh-Hant',
        theme_color: '#060708',
        background_color: '#060708',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 字型 / API 執行階段快取
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // 股票清單：離線時可回退到上次快取
            urlPattern: ({ url }) => url.pathname === '/api/twse-list' || url.pathname === '/api/tpex-list',
            handler: 'NetworkFirst',
            options: { cacheName: 'stock-list', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5175 },
});
