<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import StockRow from './StockRow.vue';

const props = defineProps({
  list:       { type: Array, required: true },
  refreshing: { type: Boolean, default: false },
  flashId:    { type: String, default: null },
});
const emit = defineEmits(['update:list', 'pulled']);

const expandedId = ref(null);
const openId     = ref(null);
const draggingId = ref(null);
const pull       = ref(0);

const scrollRef = ref(null);
let order = props.list.slice();          // 拖曳時的工作順序
let g  = {};                             // 手勢狀態
let lp = null;                           // 長按計時器

watch(() => props.list, (v) => { order = v.slice(); });

const faceOf = (id) =>
  scrollRef.value && scrollRef.value.querySelector(`[data-row-id="${CSS.escape(id)}"] .row-face`);

const ROWH = () => {
  const el = faceOf(order[0]?.code);
  return el ? el.getBoundingClientRect().height : 62;
};

const setFaceX = (id, x, withTransition) => {
  const el = faceOf(id); if (!el) return;
  el.style.transition = withTransition ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
  el.style.transform = `translateX(${x}px)`;
};
const settleFace = (id, x) => setFaceX(id, x, true);

const clearLP = () => { if (lp) { clearTimeout(lp); lp = null; } };

const startDrag = () => {
  const s = g;
  s.mode = 'drag';
  expandedId.value = null;
  openId.value = null;
  s.startIndex = order.findIndex((x) => x.code === s.rowId);
  s.rowH = ROWH();
  draggingId.value = s.rowId;
  try { scrollRef.value.setPointerCapture(s.pointerId); } catch (_) {}
  if (navigator.vibrate) navigator.vibrate(8);
};

const onDown = (e) => {
  if (e.target.closest('.row-delete') || e.target.closest('.ext-link')) { g = {}; return; }
  const rowEl = e.target.closest('[data-row-id]');
  g = {
    x0: e.clientX, y0: e.clientY, t0: Date.now(),
    rowId: rowEl ? rowEl.getAttribute('data-row-id') : null,
    scroll0: scrollRef.value.scrollTop,
    mode: null, pointerId: e.pointerId, pointerType: e.pointerType,
  };
  clearLP();
  if (g.rowId) {
    lp = setTimeout(() => { if (g.mode == null) startDrag(); }, 260);
  }
};

const onMove = (e) => {
  const s = g; if (!s) return;
  const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
  if (s.mode == null) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    clearLP();
    const atTop = scrollRef.value.scrollTop <= 0.5;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8 && s.rowId) {
      s.mode = 'swipe';
      try { scrollRef.value.setPointerCapture(s.pointerId); } catch (_) {}
    } else if (dy > 0 && atTop && !props.refreshing && s.pointerType !== 'touch') {
      // 觸控的下拉改由非被動 touch 事件處理（見下方）；這裡只服務滑鼠/觸控筆
      s.mode = 'pull';
      try { scrollRef.value.setPointerCapture(s.pointerId); } catch (_) {}
    } else {
      s.mode = 'scroll';
    }
  }
  if (s.mode === 'scroll') return;
  e.preventDefault();
  if (s.mode === 'swipe') {
    const base = openId.value === s.rowId ? -88 : 0;
    const x = Math.max(-120, Math.min(8, dx + base));
    setFaceX(s.rowId, x, false);
  } else if (s.mode === 'pull') {
    pull.value = Math.max(0, Math.min(110, dy * 0.55));
  } else if (s.mode === 'drag') {
    const n = order.length;
    const curIdx = order.findIndex((x) => x.code === s.rowId);
    const desiredTop = s.startIndex * s.rowH + dy;
    const ty = desiredTop - curIdx * s.rowH;
    const el = faceOf(s.rowId);
    if (el) { el.style.transition = 'none'; el.style.transform = `translateY(${ty}px)`; }
    let newIdx = Math.round(desiredTop / s.rowH);
    newIdx = Math.max(0, Math.min(n - 1, newIdx));
    if (newIdx !== curIdx) {
      const next = order.slice();
      const [it] = next.splice(curIdx, 1);
      next.splice(newIdx, 0, it);
      order = next;
      emit('update:list', next);
    }
  }
};

const onUp = (e) => {
  const s = g; clearLP();
  try { scrollRef.value.releasePointerCapture(s.pointerId); } catch (_) {}
  if (s.mode === 'drag') {
    const el = faceOf(s.rowId);
    if (el) { el.style.transition = 'transform .2s'; el.style.transform = 'translateY(0px)'; }
    draggingId.value = null;
  } else if (s.mode === 'swipe') {
    const dx = e.clientX - s.x0;
    const base = openId.value === s.rowId ? -88 : 0;
    const x = dx + base;
    if (x < -150) { animateDelete(s.rowId); }
    else if (x < -44) { openId.value = s.rowId; settleFace(s.rowId, -88); }
    else { openId.value = null; settleFace(s.rowId, 0); }
  } else if (s.mode === 'pull') {
    if (pull.value >= 62) emit('pulled');
    pull.value = 0;
  } else {
    const moved = Math.abs(e.clientX - s.x0) + Math.abs(e.clientY - s.y0);
    if (moved < 10) {
      if (openId.value) { settleFace(openId.value, 0); openId.value = null; }
      else if (s.rowId) { expandedId.value = expandedId.value === s.rowId ? null : s.rowId; }
    }
  }
  g = {};
};

const animateDelete = (id) => {
  const el = faceOf(id);
  if (el) { el.style.transition = 'transform .2s ease-in'; el.style.transform = 'translateX(-110%)'; }
  setTimeout(() => {
    emit('update:list', order.filter((x) => x.code !== id));
    openId.value = null;
  }, 180);
};

const onWrapClick = (e, code) => {
  if (e.target.closest('.row-delete')) { e.stopPropagation(); animateDelete(code); }
};

// 列表 / 開啟 / 拖曳狀態變動後，重設各列的 X 位移（保留已開啟者）
watch([() => props.list, openId, draggingId], async () => {
  await nextTick();
  props.list.forEach((s) => {
    if (draggingId.value === s.code) return;
    const x = openId.value === s.code ? -88 : 0;
    const el = faceOf(s.code);
    if (el) { el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'; el.style.transform = `translateX(${x}px)`; }
  });
});

// ── 觸控下拉更新 ───────────────────────────────────────────
// touch-action: pan-y 會把垂直手勢交給瀏覽器，pointer 事件來不及攔截，
// 故下拉改用「非被動 touchmove + preventDefault」直接接管（標準 pull-to-refresh 技巧）
let pullStartY = null;
let pulling = false;

const onTouchStart = (e) => {
  if (e.touches.length !== 1 || !scrollRef.value) { pullStartY = null; return; }
  // 僅在頂端、非刷新中、非拖曳中才準備下拉
  if (scrollRef.value.scrollTop <= 0.5 && !props.refreshing && !draggingId.value) {
    pullStartY = e.touches[0].clientY;
    pulling = false;
  } else {
    pullStartY = null;
  }
};

const onTouchMove = (e) => {
  if (pullStartY == null || e.touches.length !== 1 || !scrollRef.value) return;
  const dy = e.touches[0].clientY - pullStartY;
  if (dy <= 0) {                          // 往上 → 不是下拉，交還原生捲動
    if (pulling) { pulling = false; pull.value = 0; }
    return;
  }
  if (scrollRef.value.scrollTop <= 0.5) { // 仍在頂端且往下 → 接管為下拉
    pulling = true;
    if (e.cancelable) e.preventDefault();  // 非被動監聽 → 確實擋住原生捲動/overscroll
    pull.value = Math.max(0, Math.min(110, dy * 0.55));
  }
};

const onTouchEnd = () => {
  if (pullStartY == null) return;
  if (pulling && pull.value >= 62) emit('pulled');
  pullStartY = null;
  pulling = false;
  pull.value = 0;
};

onMounted(() => {
  const el = scrollRef.value;
  if (!el) return;
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });  // 關鍵：非被動
  el.addEventListener('touchend', onTouchEnd, { passive: true });
  el.addEventListener('touchcancel', onTouchEnd, { passive: true });
});
onUnmounted(() => {
  const el = scrollRef.value;
  if (!el) return;
  el.removeEventListener('touchstart', onTouchStart);
  el.removeEventListener('touchmove', onTouchMove);
  el.removeEventListener('touchend', onTouchEnd);
  el.removeEventListener('touchcancel', onTouchEnd);
});
</script>

<template>
  <div class="scroll" ref="scrollRef"
       :style="{ overflowY: (draggingId || pull) ? 'hidden' : 'auto' }"
       @pointerdown="onDown" @pointermove="onMove"
       @pointerup="onUp" @pointercancel="onUp">
    <div class="ptr" :style="{ height: pull + 'px', opacity: pull / 70 }">
      <span class="ptr-radar" :class="{ ready: pull >= 62 }" :style="{ transform: `rotate(${pull * 3}deg)` }" />
      <span class="ptr-text">{{ pull >= 62 ? '放開即更新' : '下拉更新' }}</span>
    </div>
    <div class="list-inner">
      <div v-for="s in list" :key="s.code" class="row-wrap"
           @click="onWrapClick($event, s.code)">
        <StockRow :stock="s"
                  :expanded="expandedId === s.code"
                  :dragging="draggingId === s.code"
                  :flash="flashId === s.code" />
      </div>
      <div class="list-foot">{{ list.length }} 檔自選・長按拖曳排序・左滑刪除</div>
    </div>
  </div>
</template>
