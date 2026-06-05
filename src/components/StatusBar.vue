<script setup>
import { computed } from 'vue';
import { isTradingHours } from '../utils/format.js';

const props = defineProps({ now: { type: Date, required: true } });

const pad = (n) => String(n).padStart(2, '0');
const live = computed(() => isTradingHours(props.now));
const time = computed(() => `${pad(props.now.getHours())}:${pad(props.now.getMinutes())}:${pad(props.now.getSeconds())}`);
</script>

<template>
  <div class="statusbar">
    <span class="sb-session" :class="live ? 'is-open' : 'is-closed'">
      <span class="sb-dot" />
      {{ live ? '盤中' : '盤後' }}
    </span>
    <span class="sb-updated" style="margin-left: 10px">最後更新 {{ time }}</span>
  </div>
</template>
