<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
import { searchStocks, fetchStockMeta } from '../api/index.js';

const props = defineProps({
  stockList:   { type: Array, required: true },
  popular:     { type: Array, default: () => [] },
  listLoading: { type: Boolean, default: false },
  inList:      { type: Object, required: true }, // Set
});
const emit = defineEmits(['add', 'close']);

const q             = ref('');
const added         = ref(new Set());
const directLoading = ref(false);
const directErr     = ref('');
const inputRef      = ref(null);

onMounted(() => {
  setTimeout(() => inputRef.value && inputRef.value.focus(), 280);
});

// 搜尋輸入 debounce：避免每個按鍵都對 ~2,370 檔做線性掃描；清空則立即反映（取消搜尋立刻回熱門）
const query   = ref('');
let searchTimer = null;
watch(q, (v) => {
  clearTimeout(searchTimer);
  const trimmed = v.trim();
  if (!trimmed) { query.value = ''; return; }
  searchTimer = setTimeout(() => { query.value = trimmed; }, 180);
});
onUnmounted(() => clearTimeout(searchTimer));

const results = computed(() => query.value ? searchStocks(props.stockList, query.value) : props.popular);

const looksLikeCode = computed(() => /^\d{4,6}[A-Za-z]{0,2}$/.test(query.value));
const alreadyIn     = computed(() => props.inList.has(query.value) || added.value.has(query.value));
const empty         = computed(() => query.value && results.value.length === 0);
const showLoading   = computed(() => empty.value && props.listLoading);
const showDirectAdd = computed(() => empty.value && !props.listLoading && looksLikeCode.value && !alreadyIn.value);
const showAlreadyIn = computed(() => empty.value && !props.listLoading && looksLikeCode.value && alreadyIn.value);
const showNoResult  = computed(() => empty.value && !props.listLoading && !looksLikeCode.value);

const isIn = (code) => props.inList.has(code) || added.value.has(code);

function handleAdd(s) {
  emit('add', s);
  added.value = new Set(added.value).add(s.code);
}

async function handleDirectAdd() {
  if (directLoading.value) return;
  directLoading.value = true; directErr.value = '';
  try {
    const meta = await fetchStockMeta(query.value);
    emit('add', { ...meta, high3y: 0, hd: '–', price: 0, day: 0 });
    added.value = new Set(added.value).add(query.value);
  } catch {
    directErr.value = '找不到此代號，請確認後再試';
    setTimeout(() => { directErr.value = ''; }, 2500);
  }
  directLoading.value = false;
}
</script>

<template>
  <div class="sheet-scrim" @click="$emit('close')">
    <div class="sheet" @click.stop>
      <div class="sheet-grab" />
      <div class="sheet-head">
        <div class="search-box">
          <Icon name="search" :size="18" stroke="var(--text-2)" />
          <input ref="inputRef" class="search-input"
                 placeholder="輸入代號（2330）或名稱（台積）"
                 v-model="q" inputmode="search" />
          <button v-if="q" class="search-clear" @click="q = ''" aria-label="清除">✕</button>
        </div>
        <button class="sheet-cancel" @click="$emit('close')">取消</button>
      </div>

      <div class="results">
        <!-- 前日熱門標題（無輸入且已載入） -->
        <div v-if="!query && results.length > 0" class="res-section">
          <span class="res-section-dot" />前日熱門
        </div>

        <!-- 無輸入且熱門尚未載入 → 提示 -->
        <div v-if="!query && results.length === 0" class="no-result" style="padding-top: 48px">
          {{ listLoading ? '載入前日熱門中…' : '輸入代號或名稱開始搜尋' }}<br />
          <span>上市・上櫃股票與 ETF</span>
        </div>

        <!-- 清單載入中 -->
        <div v-if="showLoading" class="no-result" style="color: var(--text-3); padding-top: 40px">載入股票清單中…</div>

        <!-- 找不到且不像代號 -->
        <div v-if="showNoResult" class="no-result">
          找不到「{{ query }}」<br />
          <span>試試股票代號或公司名稱</span>
        </div>

        <!-- 代號已在清單 -->
        <div v-if="showAlreadyIn" class="no-result">{{ query }} 已在自選清單</div>

        <!-- 直接新增（官方清單找不到時的後備） -->
        <template v-if="showDirectAdd">
          <button class="res-row" @click="handleDirectAdd" :disabled="directLoading">
            <div>
              <div class="res-line">
                <span class="res-code">{{ query }}</span>
                <span class="res-nm" style="color: var(--text-2)">
                  {{ directLoading ? '查詢中…' : '直接新增此代號' }}
                </span>
              </div>
              <div class="res-sub">從 Yahoo 股市取得名稱與資料</div>
            </div>
            <span />
            <span class="res-add">
              <span v-if="directLoading" style="color: var(--text-3); font-size: 13px">…</span>
              <Icon v-else name="plus" :size="18" :sw="2.2" stroke="var(--blue)" />
            </span>
          </button>
          <div v-if="directErr" class="no-result" style="padding-top: 16px; color: var(--sev-bad)">{{ directErr }}</div>
        </template>

        <!-- 搜尋結果 / 熱門推薦 -->
        <button v-for="s in results" :key="s.code" class="res-row"
                :disabled="isIn(s.code)" @click="!isIn(s.code) && handleAdd(s)">
          <div>
            <div class="res-line">
              <span class="res-code">{{ s.code }}</span>
              <span class="res-nm">{{ s.name }}</span>
            </div>
          </div>
          <span />
          <span class="res-add" :class="{ added: isIn(s.code) }">
            <template v-if="isIn(s.code)">已加入</template>
            <Icon v-else name="plus" :size="18" :sw="2.2" stroke="var(--blue)" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
