<script setup>
import { computed, watch } from 'vue'
import Icon from './Icon.vue'
import { usePushNotification } from '../composables/usePushNotification.js'

const props = defineProps({
  stocks: { type: Array, default: () => [] },
})

const { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe, syncStocks } = usePushNotification()

let syncTimer = null
watch(() => props.stocks, (stocks) => {
  if (!isSubscribed.value) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncStocks(stocks.map(s => ({ code: s.code, market: s.market })).filter(s => s.market))
  }, 1000)
}, { deep: true })

const needsInstall = computed(() => {
  if (typeof window === 'undefined') return false
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = window.navigator.standalone === true
  return isIOS && !isStandalone
})

function toggle() {
  if (isLoading.value) return
  const items = props.stocks.map(s => ({ code: s.code, market: s.market }))
  if (isSubscribed.value) {
    unsubscribe()
  } else {
    subscribe(items)
  }
}
</script>

<template>
  <div v-if="isSupported && (isSubscribed || stocks.length > 0)" class="notif-wrap">
    <button
      class="notif-btn"
      :class="{ active: isSubscribed, loading: isLoading }"
      :disabled="isLoading"
      :aria-label="isSubscribed ? '關閉通知' : '開啟通知'"
      @click="toggle"
    >
      <Icon name="bell" :size="18" :sw="2.2" :stroke="(isSubscribed || isLoading) ? '#2F81F7' : '#888'" />
    </button>
    <Teleport to="body">
      <div v-if="error" class="notif-toast notif-toast--error">{{ error }}</div>
      <div v-else-if="needsInstall && !isSubscribed" class="notif-toast">
        請先點「分享」→「加入主畫面」，從主畫面開啟後再開啟通知
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.notif-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: -14px;
}
.notif-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  transition: opacity 0.15s;
}
.notif-btn:disabled { cursor: default; }
.notif-btn.active { background: rgba(47, 129, 247, 0.08); }
.notif-btn.loading { animation: notif-pulse 0.9s ease-in-out infinite; }
@keyframes notif-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
</style>

<style>
.notif-toast {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 72px);
  right: 16px;
  background: #1e1e1e;
  color: #ccc;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 220px;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}
.notif-toast--error { color: #FF9500; }
</style>
