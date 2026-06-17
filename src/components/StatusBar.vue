<script setup>
import { computed } from 'vue';
import { isTradingHours } from '../utils/format.js';

const props = defineProps({
  now:        { type: Date,    required: true },
  collapsed:  { type: Boolean, default: false },
  refreshing: { type: Boolean, default: false },
});

const pad = (n) => String(n).padStart(2, '0');
const live = computed(() => isTradingHours(props.now));
const time = computed(() => `${pad(props.now.getHours())}:${pad(props.now.getMinutes())}:${pad(props.now.getSeconds())}`);
</script>

<template>
  <div class="statusbar" :class="{ 'is-tappable': collapsed }">
    <span class="sb-session" :class="live ? 'is-open' : 'is-closed'">
      <span class="sb-dot" />
      {{ live ? '盤中' : '盤後' }}
    </span>
    <span class="sb-updated" style="margin-left: 10px">最後更新 {{ time }}</span>
    <span v-if="refreshing" class="sb-spin" aria-hidden="true" />
    <span v-if="collapsed" class="sb-expand" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4"
              stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </div>
</template>

<style scoped>
@keyframes sb-spin { to { transform: rotate(360deg); } }
.sb-spin {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 1.6px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  opacity: 0.5;
  animation: sb-spin 0.8s linear infinite;
  margin-left: 6px;
  vertical-align: middle;
}
</style>
