/**
 * 回檔雷達 Dev Proxy
 * 解決瀏覽器對 Yahoo Finance 的 CORS 限制
 *
 * 用法：node dev-proxy.js
 * 開啟：http://localhost:5175
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT     = 5175;
const HTML     = path.join(__dirname, '回檔雷達.html');
const YAHOO    = 'query1.finance.yahoo.com';

// ── 幫所有回應加上 CORS header ────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

// ── 向 Yahoo Finance 發出 server-side 請求 ────────────────────
function proxyYahoo(symbol, queryStr, res) {
  const target = `https://${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?${queryStr}`;

  const req = https.get(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Accept':     'application/json',
    },
  }, (yahooRes) => {
    cors(res);
    res.writeHead(yahooRes.statusCode, { 'Content-Type': 'application/json' });
    yahooRes.pipe(res);
  });

  req.on('error', (err) => {
    cors(res);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });

  req.setTimeout(10000, () => {
    req.destroy();
    cors(res);
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'timeout' }));
  });
}

// ── 代理外部 JSON API（台股官方清單）────────────────────────
function proxyExternal(targetUrl, res) {
  const req = https.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Accept':     'application/json',
    },
  }, (up) => {
    cors(res);
    res.writeHead(up.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
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

// 台股官方清單來源
const TWSE_LIST = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';     // 上市
const TPEX_LIST = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';        // 上櫃

// ── Main server ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // 首頁：回傳 HTML
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const html = fs.readFileSync(HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('無法讀取 回檔雷達.html：' + e.message);
    }
    return;
  }

  // 台股官方清單：上市 / 上櫃
  if (pathname === '/api/twse-list') { proxyExternal(TWSE_LIST, res); return; }
  if (pathname === '/api/tpex-list') { proxyExternal(TPEX_LIST, res); return; }

  // Yahoo Finance proxy：/api/chart/:symbol
  // 例：/api/chart/2330.TW?range=3y&interval=1d
  const chartMatch = pathname.match(/^\/api\/chart\/(.+)$/);
  if (chartMatch) {
    const symbol   = chartMatch[1];
    const queryStr = req.url.split('?')[1] || '';
    proxyYahoo(symbol, queryStr, res);
    return;
  }

  // 其他路徑
  cors(res);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ◉  回檔雷達 Dev Proxy 啟動');
  console.log(`  →  http://localhost:${PORT}`);
  console.log('');
  console.log('  Ctrl+C 停止');
  console.log('');
});
