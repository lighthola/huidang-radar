<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Icon from './components/Icon.vue';
import StatusBar from './components/StatusBar.vue';
import WatchList from './components/WatchList.vue';
import EmptyState from './components/EmptyState.vue';
import SearchSheet from './components/SearchSheet.vue';
import { useStockData } from './composables/useStockData.js';
import { useWatchlist } from './composables/useWatchlist.js';
import { isTradingHours } from './utils/format.js';

const stockData = useStockData();
const { stockList, hotList, listLoading, marketOf, setMarket } = stockData;

const wl = useWatchlist({ marketOf, setMarket });
const { list, refreshing, flash, fetchCodes, refresh, addStock, setList } = wl;

const now        = ref(new Date());
const searchOpen = ref(false);

const inList = computed(() => new Set(list.value.map(x => x.code)));

function doRefresh() {
  return refresh().then(() => { now.value = new Date(); });
}

// 掛載：載入官方清單（含 market）→ 抓自選股報價（含 MIS 即時）
onMounted(async () => {
  const codes = list.value.map(s => s.code);
  await stockData.load();
  fetchCodes(codes);
});

// 每 5 分鐘在交易時間內自動刷新
let timer = null;
onMounted(() => {
  timer = setInterval(() => { if (isTradingHours()) doRefresh(); }, 5 * 60 * 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <div class="app">
    <header class="appbar">
      <div class="appbar-row">
        <div class="brand">
          <span class="brand-mark"><span class="bm-dot" /></span>
          <h1>回檔雷達</h1>
        </div>
        <button class="add-btn" @click="searchOpen = true" aria-label="新增股票">
          <Icon name="plus" :size="18" :sw="2.6" stroke="#fff" />
        </button>
      </div>
      <StatusBar :now="now" />
    </header>

    <EmptyState v-if="list.length === 0" @add="searchOpen = true" />
    <WatchList v-else
               :list="list"
               :refreshing="refreshing"
               :flash-id="flash"
               @update:list="setList"
               @pulled="doRefresh" />

    <SearchSheet v-if="searchOpen"
                 :stock-list="stockList"
                 :popular="hotList"
                 :list-loading="listLoading"
                 :in-list="inList"
                 @add="addStock"
                 @close="searchOpen = false" />
  </div>
</template>
