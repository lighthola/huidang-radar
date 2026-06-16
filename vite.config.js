import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { route } from './proxy/handlers.js';

// 共用 API middleware 邏輯（dev server 與 preview server 共用）
function applyApiMiddleware(middlewares) {
  middlewares.use((req, res, next) => {
    if (req.url && req.url.startsWith('/api/')) {
      try {
        if (route(req, res)) return;
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not Found' }));
      } catch (err) {
        if (!res.headersSent && !res.writableEnded) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err && err.message ? err.message : 'Internal Error' }));
        } else if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }
    next();
  });
}

// 開發環境與 preview 環境：把共用 proxy 路由掛成 Vite 中介層
const apiProxyPlugin = {
  name: 'api-proxy',
  configureServer(server) { applyApiMiddleware(server.middlewares); },
  configurePreviewServer(server) { applyApiMiddleware(server.middlewares); },
};

export default defineConfig(({ mode }) => {
  // 把 .env.local 的非 VITE_ 變數（Redis、VAPID）注入 process.env，
  // 供 dev server middleware 的 pushHandlers.js 使用
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
  plugins: [
    vue(),
    apiProxyPlugin,
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
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
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5175 },
  }
});
