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
      patch = (baseHigh > 0 && high > baseHigh) ? { ...rest, high3y: high, hd: todayStr() } : rest;
    }
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
  // 1) 需 3 年高點者：Yahoo fetchFull（high3y、hd + 後備現價）
  // 2) 全部：證交所 MIS 批次即時報價，覆蓋現價/漲跌
  // 3) MIS 未涵蓋且非 full：Yahoo fetchPrice 後備
  async function fetchCodes(codes) {
    if (!codes.length) return;

    const fulls = codes.filter(code => {
      const c = data[code];
      return !c?.high3y || (Date.now() - (c._full3yAt || 0) > WEEK_MS);
    });
    await Promise.allSettled(fulls.map(code =>
      fetchFull(code, marketOf(code)).then(d => updateStock(code, d)).catch(() => markErr(code))
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
      fetchPrice(code, marketOf(code)).then(d => updateStock(code, d)).catch(() => markErr(code))
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
    // 刪除後重加：搜尋結果只有 {code,name,market} 無 high3y，但快取可能仍有完整資料。
    // 若快取完整就先帶入（對齊 buildInitialList），避免 3 年高/下一關卡空白。
    const c = data[stock.code];
    const item = (c?.high3y && c?.price)
      ? { code: stock.code, name: stock.name, ...c, _loading: false, _err: false }
      : { ...stock, _loading: true, _err: false };
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
