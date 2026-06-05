import { ref } from 'vue';
import { loadStockData, cachedStockList, cachedHotList, searchStocks } from '../api/index.js';

function buildMarketMap(arr) {
  const m = {};
  for (const s of arr) if (s.market) m[s.code] = s.market;
  return m;
}

// 官方完整清單 + 前日熱門 + code→market 對照
export function useStockData() {
  const stockList   = ref(cachedStockList());
  const hotList     = ref(cachedHotList());
  const listLoading = ref(false);
  const marketMap   = ref(buildMarketMap(stockList.value));

  // 載入（每日快取），完成後回傳，供呼叫端接續抓報價
  async function load() {
    listLoading.value = true;
    const { list, hot } = await loadStockData();
    stockList.value = list;
    hotList.value   = hot;
    marketMap.value = buildMarketMap(list);
    listLoading.value = false;
    return { list, hot };
  }

  const marketOf = (code) => marketMap.value[code];
  const setMarket = (code, market) => {
    if (market && !marketMap.value[code]) marketMap.value[code] = market;
  };
  const search = (q) => searchStocks(stockList.value, q);

  return { stockList, hotList, listLoading, marketMap, marketOf, setMarket, search, load };
}
