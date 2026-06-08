// Vercel Serverless Function（catch-all）— 生產環境的 /api/* proxy
// 與開發環境共用 proxy/handlers.js 的路由邏輯
import { route } from '../proxy/handlers.js';

export default function handler(req, res) {
  try {
    if (!route(req, res)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  } catch (err) {
    // 同步例外不可冒泡；header 未送出才回 500，否則只收尾回應。
    if (!res.headersSent && !res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err && err.message ? err.message : 'Internal Error' }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
