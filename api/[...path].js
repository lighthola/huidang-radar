// Vercel Serverless Function（catch-all）— 生產環境的 /api/* proxy
// 與開發環境共用 proxy/handlers.js 的路由邏輯
import { route } from '../proxy/handlers.js';

export default function handler(req, res) {
  if (!route(req, res)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}
