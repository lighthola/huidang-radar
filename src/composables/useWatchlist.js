import { ref, watch } from 'vue';
import {
  buildInitialList, loadSavedData, saveAllData, saveList,
  fetchFull, fetchPrice, fetchQuotes, WEEK_MS,
} from '../api/index.js';

// 自選清單狀態 + 快取 + 抓價邏輯。deps: { marketOf, setMarket }
export function useWatchlist({ marketOf, setMarket }) {
  const list       = ref(buildInitialList());
  const refreshing = ref(false);
  const flash      = ref(null);

  // 各股完整資料快取（plain object，非響應式）
  let data = loadSavedData();

  // 儲存清單順序
  watch(list, (v) => saveList(v), { deep: false });

  function updateStock(code, patch) {
    list.value = list.value.map(s =>
      s.code === code ? { ...s, ...patch, _loading: false, _err: false } : s
    );
    data = { ...data, [code]: { ...(data[code] || {}), ...patch } };
    saveAllData(data);
  }

  function markErr(code) {
    list.value = list.value.map(s =>
      s.code === code ? { ...s, _loading: false, _err: true } : s
    );
  }

  // 對一組 code 抓資料
  // 1) 需 3 年高點者：Yahoo fetchFull（high5、hd + 後備現價）
  // 2) 全部：證交所 MIS 批次即時報價，覆蓋現價/漲跌
  // 3) MIS 未涵蓋且非 full：Yahoo fetchPrice 後備
  async function fetchCodes(codes) {
    if (!codes.length) return;

    const fulls = codes.filter(code => {
      const c = data[code];
      return !c?.high5 || (Date.now() - (c._full3yAt || 0) > WEEK_MS);
    });
    await Promise.allSettled(fulls.map(code =>
      fetchFull(code).then(d => updateStock(code, d)).catch(() => markErr(code))
    ));

    const withMkt = codes
      .map(code => ({ code, market: marketOf(code) }))
      .filter(it => it.market);
    let quotes = {};
    if (withMkt.length) {
      try { quotes = await fetchQuotes(withMkt); } catch {}
    }
    Object.entries(quotes).forEach(([code, q]) => updateStock(code, q));

    const got  = new Set(Object.keys(quotes));
    const rest = codes.filter(code => !got.has(code) && !fulls.includes(code));
    await Promise.allSettled(rest.map(code =>
      fetchPrice(code).then(d => updateStock(code, d)).catch(() => markErr(code))
    ));
  }

  function refresh() {
    if (refreshing.value) return Promise.resolve();
    refreshing.value = true;
    return fetchCodes(list.value.map(s => s.code)).finally(() => {
      refreshing.value = false;
    });
  }

  function addStock(stock) {
    if (list.value.some(x => x.code === stock.code)) return;
    list.value = [...list.value, { ...stock, _loading: true, _err: false }];
    if (stock.market) setMarket(stock.code, stock.market);
    fetchCodes([stock.code]);
    flash.value = stock.code;
    setTimeout(() => { flash.value = null; }, 1400);
  }

  function setList(arr)     { list.value = arr; }
  function removeStock(code) { list.value = list.value.filter(x => x.code !== code); }

  return { list, refreshing, flash, updateStock, markErr, fetchCodes, refresh, addStock, setList, removeStock };
}
