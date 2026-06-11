// ── API & localStorage 快取 ───────────────────────────────
const API_BASE = '/api/chart';
const LS_LIST  = 'radar_list';
const LS_DATA  = 'radar_data';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS   = 24 * 60 * 60 * 1000;

const LS_STOCKS    = 'radar_stocks';
const LS_HOT       = 'radar_hot';
const LS_STOCKS_AT = 'radar_stocks_at';

export function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

export function loadSavedData() { return lsGet(LS_DATA) || {}; }
export function saveAllData(m)  { lsSet(LS_DATA, m); }
export function loadSavedList() { return lsGet(LS_LIST); }
export function saveList(list)  { lsSet(LS_LIST, list.map(({ code, name }) => ({ code, name }))); }

// 從 chart result 取現價與今日漲跌
// 優先用 meta.regularMarketPrice（最即時報價）；當日日線 bar 為 null 時，
// 避免「從尾端找第一個非空收盤」誤抓到更舊的昨收（例：0050 抓成 107.60）
export function currentQuote(r) {
  const meta   = r.meta || {};
  const closes = r.indicators?.quote?.[0]?.close || [];
  let lastClose = null, prevClose = null, cnt = 0;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (closes[i] != null) {
      if (cnt === 0) lastClose = +closes[i].toFixed(2);
      else if (cnt === 1) { prevClose = +closes[i].toFixed(2); break; }
      cnt++;
    }
  }
  const price = +Number(meta.regularMarketPrice ?? lastClose ?? 0).toFixed(2);
  const sameDay = lastClose != null && Math.abs(price - lastClose) < 0.005;
  const prev    = sameDay ? prevClose : lastClose;
  const day     = prev ? +((price - prev) / prev * 100).toFixed(2) : 0;
  const high    = meta.regularMarketDayHigh > 0 ? +Number(meta.regularMarketDayHigh).toFixed(2) : null;
  return high != null ? { price, day, high } : { price, day };
}

// Yahoo Finance 代號後綴：上市 .TW、上櫃 .TWO
function yahooSymbol(code, market) {
  return code + (market === 'otc' ? '.TWO' : '.TW');
}

// 3 年日線資料 → high3y（還原股價）、hd、現價、今日漲跌
export async function fetchFull(code, market) {
  const res = await fetch(`${API_BASE}?symbol=${yahooSymbol(code, market)}&range=3y&interval=1d`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.chart?.error) throw new Error(json.chart.error.description || 'API error');
  const r = json.chart.result[0];
  if (!r) throw new Error('no data');

  const ts     = r.timestamp;
  const adjcl  = r.indicators.adjclose[0].adjclose;
  const closes = r.indicators.quote[0].close;
  const highs  = r.indicators.quote[0].high;

  // 3 年高點：盤中最高價 × 還原係數（adjclose/close），正確處理分割
  let high3y = 0, hIdx = 0;
  for (let i = 0; i < highs.length; i++) {
    if (highs[i] !== null && closes[i] && adjcl[i]) {
      const adjH = highs[i] * (adjcl[i] / closes[i]);
      if (adjH > high3y) { high3y = adjH; hIdx = i; }
    }
  }
  high3y = +high3y.toFixed(2);

  const dt = new Date(ts[hIdx] * 1000);
  const hd = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;

  const { price, day } = currentQuote(r);
  return { high3y, hd, price, day, _full3yAt: Date.now() };
}

// 5 日資料 → 現價 + 今日漲跌（Yahoo 後備）
export async function fetchPrice(code, market) {
  const res = await fetch(`${API_BASE}?symbol=${yahooSymbol(code, market)}&range=5d&interval=1d`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.chart?.error) throw new Error(json.chart.error.description || 'API error');
  const r = json.chart.result[0];
  if (!r) throw new Error('no data');
  return currentQuote(r);
}

// 從 Yahoo 取得股票名稱（直接新增未知代號用）
// 市場別未知 → 先試上市 .TW，再試上櫃 .TWO；回傳判定的 market 供後續即時報價用
export async function fetchStockMeta(code) {
  for (const [suffix, market] of [['.TW', 'tse'], ['.TWO', 'otc']]) {
    try {
      const res = await fetch(`${API_BASE}?symbol=${code}${suffix}&range=1d&interval=1d`);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.chart?.error) continue;
      const r = json.chart?.result?.[0];
      if (!r) continue;
      const short = r.meta.shortName || '';
      const long  = r.meta.longName  || '';
      const looksLikeMgmt = /management|asset|co\.?\s*ltd|securities/i.test(short);
      const raw = (!looksLikeMgmt && short) ? short : (long || short || code);
      const name = raw.replace(/\s+(Co\.,?\s*Ltd\.?|Inc\.?|Corp\.?)$/i, '').trim() || code;
      return { code, name, market };
    } catch { /* 試下一個後綴 */ }
  }
  throw new Error('找不到此代號');
}

// ── 證交所 MIS 即時報價 ───────────────────────────────────
// 取價優先序：成交價 z → 上次成交 pz → 買賣價中點 → 開盤 o → 昨收 y
export function parseMisQuote(s) {
  const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
  const z    = num(s.z);
  const pz   = num(s.pz);
  const bid  = num((s.b || '').split('_')[0]);
  const ask  = num((s.a || '').split('_')[0]);
  const open = num(s.o);
  const prev = num(s.y);
  let price = z ?? pz;
  if (price == null && bid != null && ask != null) price = (bid + ask) / 2;
  if (price == null) price = bid ?? ask ?? open ?? prev;
  if (price == null) return null;
  price = +price.toFixed(2);
  const day = prev ? +((price - prev) / prev * 100).toFixed(2) : 0;
  const high = num(s.h);   // 當日盤中最高（突破 3 年高時用於即時上修 high3y）
  return high != null ? { price, day, high } : { price, day };
}

// 批次即時報價：items = [{ code, market }] → { code: { price, day } }
export async function fetchQuotes(items) {
  const valid = items.filter(it => it.market);
  if (!valid.length) return {};
  const ids = valid.map(it => `${it.market}_${it.code}.tw`).join('|');
  const res = await fetch(`/api/quote?ids=${encodeURIComponent(ids)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const out = {};
  (json.msgArray || []).forEach(s => {
    const q = parseMisQuote(s);
    if (q) out[s.c] = q;
  });
  return out;
}

// ── 台股官方完整清單（證交所上市 + 櫃買上櫃）──────────────
// 每檔含 market（tse/otc）供即時報價帶前綴；附成交金額排序出前日熱門
export async function fetchStockData() {
  const [twse, tpex] = await Promise.allSettled([
    fetch('/api/twse-list').then(r => r.ok ? r.json() : []),
    fetch('/api/tpex-list').then(r => r.ok ? r.json() : []),
  ]);
  const all = [], seen = new Set();
  const push = (code, name, val, market) => {
    code = String(code || '').trim();
    name = String(name || '').trim();
    if (code && name && !seen.has(code)) {
      seen.add(code);
      all.push({ code, name, market, val: Number(val) || 0 });
    }
  };
  if (twse.status === 'fulfilled' && Array.isArray(twse.value))
    twse.value.forEach(x => push(x.Code, x.Name, x.TradeValue, 'tse'));
  if (tpex.status === 'fulfilled' && Array.isArray(tpex.value))
    tpex.value.forEach(x => push(x.SecuritiesCompanyCode, x.CompanyName, x.TransactionAmount, 'otc'));

  const list = all.map(({ code, name, market }) => ({ code, name, market }));
  const hot  = all.slice()
    .sort((a, b) => b.val - a.val)
    .slice(0, 10)
    .map(({ code, name, market }) => ({ code, name, market }));
  return { list, hot };
}

// 載入：優先用每日快取，過期 / 無快取 / 舊版缺 market 時重新抓取
export async function loadStockData() {
  const cachedList = lsGet(LS_STOCKS);
  const cachedHot  = lsGet(LS_HOT) || [];
  const at         = lsGet(LS_STOCKS_AT) || 0;
  const cacheOk    = cachedList?.length && cachedList[0]?.market && (Date.now() - at < DAY_MS);
  if (cacheOk) return { list: cachedList, hot: cachedHot };
  try {
    const fresh = await fetchStockData();
    if (fresh.list.length) {
      lsSet(LS_STOCKS, fresh.list);
      lsSet(LS_HOT, fresh.hot);
      lsSet(LS_STOCKS_AT, Date.now());
      return fresh;
    }
  } catch {}
  return { list: cachedList || [], hot: cachedHot };
}

export function cachedStockList() { return lsGet(LS_STOCKS) || []; }
export function cachedHotList()   { return lsGet(LS_HOT) || []; }

// 本地搜尋：代號前綴優先（依代號排序），其次名稱包含
export function searchStocks(list, q) {
  const query = q.trim();
  if (!query) return [];
  const lq = query.toLowerCase();
  const byCode = [], byName = [];
  for (const s of list) {
    if (s.code.toLowerCase().startsWith(lq)) byCode.push(s);
    else if (s.name.includes(query)) byName.push(s);
  }
  byCode.sort((a, b) => a.code.localeCompare(b.code));
  return [...byCode, ...byName].slice(0, 80);
}

// 初始自選清單：完全來自 localStorage；無清單時回傳空陣列（顯示引導畫面）
export function buildInitialList() {
  const saved = loadSavedList();
  if (!saved?.length) return [];
  const data = loadSavedData();
  return saved.map(({ code, name }) => {
    const d = data[code];
    if (d?.high3y && d?.price) return { code, name, ...d, _loading: false, _err: false };
    return { code, name, high3y: 0, hd: '–', price: 0, day: 0, _loading: true, _err: false };
  });
}
