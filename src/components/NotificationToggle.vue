<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { usePushNotification } from '../composables/usePushNotification.js'

const props = defineProps({
  stocks: { type: Array, default: () => [] },
})

const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotification()

// iOS 且尚未 standalone 模式：需引導加入主畫面
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
  <div v-if="isSupported" class="notif-wrap">
    <button
      class="notif-btn"
      :class="{ active: isSubscribed }"
      :disabled="isLoading"
      :aria-label="isSubscribed ? '關閉通知' : '開啟通知'"
      @click="toggle"
    >
      <Icon name="bell" :size="18" :sw="2.2" :stroke="isSubscribed ? '#4ade80' : '#888'" />
    </button>
    <div v-if="needsInstall && !isSubscribed" class="notif-tip">
      請先點「分享」→「加入主畫面」，從主畫面開啟後再開啟通知
    </div>
  </div>
</template>

<style scoped>
.notif-wrap {
  position: relative;
  display: flex;
  align-items: center;
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
.notif-btn:disabled { opacity: 0.4; cursor: default; }
.notif-btn.active { background: rgba(74, 222, 128, 0.08); }
.notif-tip {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  background: #1e1e1e;
  color: #ccc;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: 8px;
  width: 220px;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
</style>
