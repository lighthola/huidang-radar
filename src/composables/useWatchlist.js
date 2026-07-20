import { ref, watch, onMounted, onUnmounted } from 'vue';
import {
  buildInitialList, hydrateItem, loadSavedData, saveAllData, saveList,
  fetchFull, fetchPrice, fetchQuotes, WEEK_MS,
} from '../api/index.js';

// 自選清單狀態 + 快取 + 抓價邏輯。deps: { marketOf, setMarket }
export function useWatchlist({ marketOf, setMarket }) {
  const list       = ref(buildInitialList());
  const refreshing = ref(false);
  const flash      = ref(null);

  // 各股完整資料快取（plain object，非響應式）
  let data = loadSavedData();

  // 儲存清單順序：debounce 合併拖曳中「每跨一格」的高頻寫入；
  // pagehide / 轉背景時 flush，確保關 app 前最後順序一定落地（避免 debounce 尾端遺失）
  let saveTimer = null;
  const flushSave = () => {
    if (!saveTimer) return;            // 無待寫 → 已是最新，不重複寫
    clearTimeout(saveTimer);
    saveTimer = null;
    saveList(list.value);
  };
  watch(list, () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; saveList(list.value); }, 400);
  }, { deep: false });

  const onHide = () => { if (document.visibilityState === 'hidden') flushSave(); };
  onMounted(() => {
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', onHide);
  });
  onUnmounted(() => {
    flushSave();                       // 元件卸載也先把待寫的存掉
    window.removeEventListener('pagehide', flushSave);
    document.removeEventListener('visibilitychange', onHide);
  });

  // 今日日期字串（YYYY/MM/DD，與 fetchFull 的 hd 同格式）
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  function updateStock(code, patch) {
    // 報價可能帶當日盤中最高 high（MIS s.h / Yahoo dayHigh）。3 年高 high3y 每週才重抓、
    // 盤中凍結，個股盤中突破 3 年高時 price 會大於凍結的 high3y，使回檔算成正值、下一關卡錯亂。
    // 故突破時即時上修 high3y＝當日盤中最高、並把高點日標記為今日；high 本身不落地，
    // 正式還原高點待下次 Yahoo 重抓校正。用 s.h（當日累積最高）而非現價，故創高後又跌落也正確。
    if (patch.high != null) {
      const { high, ...rest } = patch;
      const baseHigh = rest.high3y ?? data[code]?.high3y ?? 0;
      // 僅在「已有已知 3 年高且被突破」時上修；無 3 年高時不以當日高捏造
      patch = (baseHigh > 0 && high > baseHigh) ? { ...rest, high3y: high, high3yRaw: high, hd: todayStr() } : rest;
    }
    list.value = list.value.map(s =>
      s.code === code ? { ...s, ...patch, _loading: false, _err: false } : s
    );
    data = { ...data, [code]: { ...(data[code] || {}), ...patch } };
    saveAllData(data);
  }

  function markErr(code) {
    list.value = list.value.map(s => {
      if (s.code !== code) return s;
      if (s.price > 0) return { ...s, _loading: false };
      return { ...s, _loading: false, _err: true };
    });
  }

  // 對一組 code 抓資料
  // 1) 需 3 年高點者：Yahoo fetchFull（high3y、hd + 後備現價）
  // 2) 全部：證交所 MIS 批次即時報價，覆蓋現價/漲跌
  // 3) MIS 未涵蓋且非 full：Yahoo fetchPrice 後備
  async function fetchCodes(codes) {
    if (!codes.length) return { quotesOk: true };

    // 回填 market 到缺漏的項目（舊存檔 / 快取加入路徑），權威來源為 marketOf；
    // watch(list) 隨後會把帶 market 的清單存回 localStorage（舊使用者自動升級）
    list.value = list.value.map(s => s.market ? s : { ...s, market: marketOf(s.code) });
    // 抓資料的市場別：item 自己記住的 market 優先、其次 marketOf。
    // 官方清單萬一暫時殘缺，個股仍知道自己是 otc，不會退回 .TW 抓嘸資料。
    const mkt = (code) => list.value.find(s => s.code === code)?.market || marketOf(code);

    const fulls = codes.filter(code => {
      const c = data[code];
      // high3yRaw 為新增欄位：舊快取沒有時強制重抓一次補上，不必等滿一週
      return !c?.high3y || c.high3yRaw == null || (Date.now() - (c._full3yAt || 0) > WEEK_MS);
    });
    await Promise.allSettled(fulls.map(code =>
      fetchFull(code, mkt(code)).then(d => updateStock(code, d)).catch(() => markErr(code))
    ));

    const withMkt = codes
      .map(code => ({ code, market: mkt(code) }))
      .filter(it => it.market);
    let quotes = {};
    let quotesOk = true;
    if (withMkt.length) {
      try { quotes = await fetchQuotes(withMkt); } catch { quotesOk = false; }
    }
    Object.entries(quotes).forEach(([code, q]) => updateStock(code, q));

    const got  = new Set(Object.keys(quotes));
    const rest = codes.filter(code => !got.has(code) && !fulls.includes(code));
    await Promise.allSettled(rest.map(code =>
      fetchPrice(code, mkt(code)).then(d => updateStock(code, d)).catch(() => markErr(code))
    ));

    return { quotesOk };
  }

  async function refresh() {
    if (refreshing.value) return { ok: false, skipped: true };
    refreshing.value = true;
    try {
      const { quotesOk } = await fetchCodes(list.value.map(s => s.code));
      return { ok: quotesOk };
    } finally {
      refreshing.value = false;
    }
  }

  function addStock(stock) {
    if (list.value.some(x => x.code === stock.code)) return;
    // 刪除後重加：搜尋結果只有 {code,name,market} 無 high3y，但快取可能仍有完整資料。
    // 用 hydrateItem 與 buildInitialList 共用同一份水合：快取完整就先帶入，避免 3 年高/下一關卡空白。
    const item = hydrateItem(stock.code, stock.name, stock.market, data);
    list.value = [...list.value, item];
    if (stock.market) setMarket(stock.code, stock.market);
    fetchCodes([stock.code]);
    flash.value = stock.code;
    setTimeout(() => { flash.value = null; }, 1400);
  }

  function setList(arr)     { list.value = arr; }
  function removeStock(code) { list.value = list.value.filter(x => x.code !== code); }

  return { list, refreshing, flash, updateStock, markErr, fetchCodes, refresh, addStock, setList, removeStock };
}
