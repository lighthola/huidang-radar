import { ref } from 'vue';
import { loadStockData, cachedStockList, cachedHotList } from '../api/index.js';

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
    // try/finally：重設 loading 旗標由 load() 自身保證，不依賴 loadStockData 永不拋的隱性約定
    try {
      const { list, hot } = await loadStockData();
      stockList.value = list;
      hotList.value   = hot;
      marketMap.value = buildMarketMap(list);
      return { list, hot };
    } finally {
      listLoading.value = false;
    }
  }

  const marketOf = (code) => marketMap.value[code];
  const setMarket = (code, market) => {
    if (market && !marketMap.value[code]) marketMap.value[code] = market;
  };

  return { stockList, hotList, listLoading, marketOf, setMarket, load };
}
