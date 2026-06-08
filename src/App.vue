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

// 標題列（品牌列）隨捲動收合；狀態列恆顯示，點擊狀態列可展回標題列
const brandHidden = ref(false);
let lastScrollTop = 0;
function onListScroll(top) {
  if (top <= 4) brandHidden.value = false;             // 回到頂端 → 顯示
  else if (top > lastScrollTop && top > 44) brandHidden.value = true; // 往下捲 → 收合
  lastScrollTop = top;
}
function revealBrand() { brandHidden.value = false; }

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
    <header class="appbar" :class="{ 'brand-collapsed': brandHidden }">
      <div class="appbar-row">
        <div class="brand">
          <span class="brand-mark"><span class="bm-dot" /></span>
          <h1>回檔雷達</h1>
        </div>
        <button class="add-btn" @click="searchOpen = true" aria-label="新增股票">
          <Icon name="plus" :size="18" :sw="2.6" stroke="#fff" />
        </button>
      </div>
      <StatusBar :now="now" :collapsed="brandHidden" @click="revealBrand" />
    </header>

    <EmptyState v-if="list.length === 0" @add="searchOpen = true" />
    <WatchList v-else
               :list="list"
               :refreshing="refreshing"
               :flash-id="flash"
               @update:list="setList"
               @scroll="onListScroll"
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
