import { ref } from 'vue'

const LS_DEVICE_ID    = 'push_device_id'
const LS_SUBSCRIBED   = 'push_subscribed'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function getDeviceId() {
  let id = localStorage.getItem(LS_DEVICE_ID)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(LS_DEVICE_ID, id)
  }
  return id
}

export function usePushNotification() {
  const isSupported  = ref(
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
  const isSubscribed = ref(localStorage.getItem(LS_SUBSCRIBED) === 'true')
  const isLoading    = ref(false)
  const error        = ref(null)
  let _errorTimer    = null

  function setError(msg) {
    error.value = msg
    clearTimeout(_errorTimer)
    _errorTimer = setTimeout(() => { error.value = null }, 3000)
  }

  async function subscribe(stocks) {
    if (!isSupported.value) return
    isLoading.value = true
    error.value = null
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('通知權限未授權')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      })
      const deviceId = getDeviceId()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, subscription, stocks }),
      })
      if (!res.ok) throw new Error(`subscribe failed: ${res.status}`)
      isSubscribed.value = true
      localStorage.setItem(LS_SUBSCRIBED, 'true')
    } catch (e) {
      setError(e.message)
    } finally {
      isLoading.value = false
    }
  }

  async function unsubscribe() {
    isLoading.value = true
    error.value = null
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      const deviceId = getDeviceId()
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      isSubscribed.value = false
      localStorage.setItem(LS_SUBSCRIBED, 'false')
    } catch (e) {
      setError(e.message)
    } finally {
      isLoading.value = false
    }
  }

  // watchlist 改變時重送整包 subscription 覆寫 Redis
  async function syncStocks(stocks) {
    if (!isSubscribed.value) return
    try {
      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.getSubscription()
      if (!subscription) return
      const deviceId = getDeviceId()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, subscription, stocks }),
      })
    } catch { /* 靜默失敗，下次訂閱時會補齊 */ }
  }

  return { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe, syncStocks }
}
