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

// 只允許自己的網域跨來源讀取（app 與 /api 同源、不需 ACAO 仍正常；擋掉瀏覽器搭便車）
const ALLOW_ORIGINS = [
  'https://huidang-radar.vercel.app',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
];
function allowOrigin(req) {
  const o = req.headers.origin;
  return o && ALLOW_ORIGINS.includes(o) ? o : null;
}

// origin 為白名單內的來源時 echo 回去；非白名單則不發 ACAO（瀏覽器即擋下跨來源讀取）
function cors(res, origin) {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');   // ACAO 隨 Origin 而變，避免快取串用
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

// 向目標發出 server-side GET，串流回應
function pipeGet(targetUrl, res, origin, extraHeaders = {}) {
  // 是否已決定回應（成功開始串流，或已送出錯誤）。timeout 與 'error' 可能接連觸發
  // （req.destroy() 會引發 'error'），用此旗標避免對同一回應重複下決定。
  let settled = false;

  // 安全送出錯誤回應：若 header 已送出（已開始串流上游內容）或回應已結束，
  // 就不可再 setHeader/writeHead（會丟 ERR_HTTP_HEADERS_SENT 而崩潰 dev server），
  // 此時只確保把回應收尾。
  const fail = (status, message) => {
    if (settled) return;
    settled = true;
    if (res.headersSent || res.writableEnded) {
      if (!res.writableEnded) res.end();
      return;
    }
    cors(res, origin);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: message }));
  };

  const req = https.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Accept': 'application/json',
      ...extraHeaders,
    },
  }, (up) => {
    // 若已逾時/出錯先一步決定回應，丟棄遲到的上游回應並排空，避免 socket 洩漏
    if (settled) { up.resume(); return; }
    settled = true;
    cors(res, origin);
    res.writeHead(up.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8' });
    // 串流過程中上游中斷：header 已送出，只能中止回應，不可再 writeHead
    up.on('error', () => { if (!res.writableEnded) res.end(); });
    up.pipe(res);
  });

  req.on('error', (err) => fail(502, err.message));
  req.setTimeout(15000, () => {
    // 先送出 504（此時 settled 仍為 false），再 destroy；destroy 引發的 'error'
    // 會因 settled 已為 true 而被 fail() 忽略。
    fail(504, 'timeout');
    req.destroy();
  });
}

// 依完整 req.url 分派（/api/...），回傳 true 表示已處理
export function route(req, res) {
  const url      = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const origin   = allowOrigin(req);

  if (req.method === 'OPTIONS') {
    cors(res, origin);
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
    pipeGet(`https://${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`, res, origin);
    return true;
  }

  // 證交所 MIS 即時報價：/api/quote?ids=...
  if (pathname === '/api/quote') {
    const ids = url.searchParams.get('ids') || '';
    pipeGet(`${MIS}?ex_ch=${encodeURIComponent(ids)}&json=1&delay=0`, res, origin, {
      Referer: 'https://mis.twse.com.tw/stock/fibest.jsp',
    });
    return true;
  }

  // 官方清單
  if (pathname === '/api/twse-list') { pipeGet(TWSE_LIST, res, origin); return true; }
  if (pathname === '/api/tpex-list') { pipeGet(TPEX_LIST, res, origin); return true; }

  return false;
}
