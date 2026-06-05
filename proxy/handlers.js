/**
 * 共用 proxy 路由 — 同一份邏輯供「Vite 開發中介層」與「Vercel Serverless Function」使用
 *
 * 路由：
 *   /api/chart/{symbol}?range=...&interval=...   → Yahoo Finance（股價/3年高點）
 *   /api/quote?ids=tse_2330.tw|otc_6488.tw       → 證交所 MIS 即時報價（帶 Referer）
 *   /api/twse-list                               → 證交所 OpenAPI 上市清單
 *   /api/tpex-list                               → 櫃買 OpenAPI 上櫃清單
 */
import https from 'node:https';
import { URL } from 'node:url';

const YAHOO     = 'query1.finance.yahoo.com';
const MIS       = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';
const TWSE_LIST = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TPEX_LIST = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

// 向目標發出 server-side GET，串流回應
function pipeGet(targetUrl, res, extraHeaders = {}) {
  const req = https.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Accept': 'application/json',
      ...extraHeaders,
    },
  }, (up) => {
    cors(res);
    res.writeHead(up.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8' });
    up.pipe(res);
  });
  req.on('error', (err) => {
    cors(res);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
  req.setTimeout(15000, () => {
    req.destroy();
    cors(res);
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'timeout' }));
  });
}

// 依完整 req.url 分派（/api/...），回傳 true 表示已處理
export function route(req, res) {
  const url      = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // Yahoo Finance：/api/chart?symbol=0050.TW&range=...&interval=...
  // symbol 放查詢參數（非路徑），避免 Vercel 對多段路徑 / 含點路徑的攔截
  if (pathname === '/api/chart') {
    const symbol   = url.searchParams.get('symbol') || '';
    const range    = url.searchParams.get('range') || '1d';
    const interval = url.searchParams.get('interval') || '1d';
    const qs = `range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
    pipeGet(`https://${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`, res);
    return true;
  }

  // 證交所 MIS 即時報價：/api/quote?ids=...
  if (pathname === '/api/quote') {
    const ids = url.searchParams.get('ids') || '';
    pipeGet(`${MIS}?ex_ch=${encodeURIComponent(ids)}&json=1&delay=0`, res, {
      Referer: 'https://mis.twse.com.tw/stock/fibest.jsp',
    });
    return true;
  }

  // 官方清單
  if (pathname === '/api/twse-list') { pipeGet(TWSE_LIST, res); return true; }
  if (pathname === '/api/tpex-list') { pipeGet(TPEX_LIST, res); return true; }

  return false;
}
