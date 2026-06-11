<script setup>
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import { useShareCard } from '../composables/useShareCard.js';
import { retracement, severity, nextLevel, fmt, fmtPct, SEV_COLOR } from '../utils/format.js';

const { sharing, shareRow } = useShareCard();
const faceRef = ref(null);
const onShare = () => shareRow(faceRef.value, props.stock.code);

const props = defineProps({
  stock:    { type: Object, required: true },
  expanded: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  flash:    { type: Boolean, default: false },
});

const isLoading = computed(() => props.stock._loading);
const hasData   = computed(() => !isLoading.value && props.stock.price > 0 && props.stock.high3y > 0);
const ret       = computed(() => hasData.value ? retracement(props.stock) : 0);
const mag        = computed(() => Math.abs(ret.value));
const sev        = computed(() => severity(mag.value));
const nl         = computed(() => hasData.value ? nextLevel(props.stock) : null);
const dropAmt    = computed(() => hasData.value ? props.stock.high3y - props.stock.price : 0);
const levels     = computed(() => {
  const maxLvl = nl.value ? Math.max(35, nl.value.pct + 10) : 35;
  const out = [];
  for (let l = 5; l <= maxLvl; l += 5) out.push(l);
  return out;
});
const dayColor = computed(() =>
  props.stock.day > 0 ? 'var(--up)' : props.stock.day < 0 ? 'var(--down)' : 'var(--text-2)');
</script>

<template>
  <div class="row" :class="{ dragging, flash }" :data-row-id="stock.code">
    <div class="row-delete">
      <span><Icon name="trash" :size="18" :sw="1.9" /> 刪除</span>
    </div>
    <div class="row-face" ref="faceRef">
      <div class="row-top">
        <span class="drag-grip"><Icon name="grip" :size="18" stroke="var(--text-3)" /></span>

        <!-- 第一行：代號 + 名稱 + 外開連結 -->
        <div class="r-header">
          <span class="r-code">{{ stock.code }}</span>
          <span class="r-nm">{{ stock.name }}</span>
          <a class="ext-link"
             :href="`https://tw.stock.yahoo.com/quote/${stock.code}.${stock.market === 'otc' ? 'TWO' : 'TW'}`"
             target="_blank" rel="noopener noreferrer"
             aria-label="開啟 Yahoo 股市"
             @click.stop>
            <Icon name="external" :size="13" :sw="1.7" stroke="currentColor" />
          </a>
        </div>

        <!-- 第二行：3年高 / 現價回檔 / 下一關卡 -->
        <div class="r-data">
          <div class="r-sub">
            <div class="r-col-lbl">3年高</div>
            <div class="r-sub-val">{{ stock.high3y > 0 ? fmt(stock.high3y) : '──' }}</div>
          </div>

          <div class="r-price">
            <div class="r-col-lbl">現價</div>
            <div v-if="isLoading" class="r-placeholder">── ──</div>
            <div v-else-if="stock._err" class="r-err">無法取得</div>
            <template v-else>
              <div class="r-now">{{ fmt(stock.price) }}</div>
              <div class="r-ret" :style="{ color: SEV_COLOR[sev] }">{{ fmtPct(ret) }}</div>
            </template>
          </div>

          <div class="r-next">
            <div class="r-col-lbl">下一關卡</div>
            <div v-if="isLoading" class="r-placeholder" style="font-size: 12px">載入中…</div>
            <template v-else-if="!stock._err && nl">
              <div class="r-next-price">{{ fmt(nl.price) }}</div>
              <div class="r-next-pct" :style="{ color: SEV_COLOR[nl.sev] }">{{ fmtPct(-nl.pct, 0) }}</div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="expanded && hasData" class="row-detail">
        <div class="detail-stats">
          <div class="ds-item">
            <span class="ds-k">距 3 年高點</span>
            <span class="ds-v" :style="{ color: SEV_COLOR[sev] }">{{ fmtPct(ret) }} · {{ fmt(dropAmt) }}</span>
          </div>
          <div class="ds-item">
            <span class="ds-k">高點日期</span>
            <span class="ds-v">{{ stock.hd }}</span>
          </div>
          <div class="ds-item">
            <span class="ds-k">今日</span>
            <span class="ds-v" :style="{ color: dayColor }">{{ fmtPct(stock.day, 2) }}</span>
          </div>
          <div class="ds-item">
            <span class="ds-k">距下一關卡</span>
            <span class="ds-v">{{ fmt(stock.price - nl.price) }}</span>
          </div>
        </div>
        <div class="ladder">
          <span v-for="l in levels" :key="l"
                class="lad"
                :class="{ passed: mag >= l - 1e-6, next: l === nl.pct }">
            −{{ l }}%
          </span>
        </div>

        <div class="share-bar">
          <span class="share-credit" data-share-credit>
            <span class="sf-brand">回檔雷達</span>
            <span class="sf-time" data-share-time></span>
          </span>
          <button class="share-btn" data-share-btn type="button"
                  :disabled="sharing"
                  aria-label="分享此卡片"
                  @click.stop="onShare">
            <Icon name="share" :size="15" :sw="1.7" stroke="currentColor" />
            <span>{{ sharing ? '處理中…' : '分享' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
