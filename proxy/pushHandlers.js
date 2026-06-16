import https from 'node:https'
import webpush from 'web-push'
import { Redis } from '@upstash/redis'

let _redis = null
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return _redis
}

let _vapidSet = false
function ensureVapid() {
  if (_vapidSet) return
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  _vapidSet = true
}

const LEVELS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40]
const BUFFER = 0.02
const MIS = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'

function parseBody(req) {
  if (req.body !== undefined) return Promise.resolve(req.body)
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

// 取價優先序：z → pz → 買賣中點 → o → y（與 src/api/index.js parseMisQuote 一致）
function parseMisPrice(s) {
  const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null }
  const z   = num(s.z)
  const pz  = num(s.pz)
  const bid = num((s.b || '').split('_')[0])
  const ask = num((s.a || '').split('_')[0])
  const o   = num(s.o)
  const y   = num(s.y)
  let price = z ?? pz
  if (price == null && bid != null && ask != null) price = (bid + ask) / 2
  if (price == null) price = bid ?? ask ?? o ?? y
  return price != null ? +price.toFixed(2) : null
}

function fetchMis(items) {
  const ids = items.map(it => `${it.market}_${it.code}.tw`).join('|')
  const url = `${MIS}?ex_ch=${encodeURIComponent(ids)}&json=1&delay=0`
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
        Referer: 'https://mis.twse.com.tw/stock/fibest.jsp',
      },
    }, res => {
      let body = ''
      res.on('data', c => { body += c })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch { reject(new Error('MIS JSON parse error')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('MIS timeout')) })
  })
}

function fetchYahoo(code, market) {
  const suffix = market === 'otc' ? '.TWO' : '.TW'
  const symbol = encodeURIComponent(code + suffix)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3y&interval=1d`
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
      },
    }, res => {
      let body = ''
      res.on('data', c => { body += c })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          const r = json.chart?.result?.[0]
          if (!r) return reject(new Error('no data'))
          const adjcl = r.indicators.adjclose[0].adjclose
          const closes = r.indicators.quote[0].close
          const highs  = r.indicators.quote[0].high
          let high3y = 0
          for (let i = 0; i < highs.length; i++) {
            if (highs[i] !== null && closes[i] && adjcl[i]) {
              const adjH = highs[i] * (adjcl[i] / closes[i])
              if (adjH > high3y) high3y = adjH
            }
          }
          resolve(+high3y.toFixed(2))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Yahoo timeout')) })
  })
}

export async function handleSubscribe(req, res) {
  if (req.method === 'POST') {
    try {
      const { deviceId, subscription, stocks } = await parseBody(req)
      if (!deviceId || !subscription || !stocks) return json(res, 400, { error: 'missing fields' })
      await getRedis().set(`sub:${deviceId}`, { subscription, stocks })
      return json(res, 200, { ok: true })
    } catch (e) {
      return json(res, 500, { error: e.message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { deviceId } = await parseBody(req)
      if (!deviceId) return json(res, 400, { error: 'missing deviceId' })
      await getRedis().del(`sub:${deviceId}`)
      return json(res, 200, { ok: true })
    } catch (e) {
      return json(res, 500, { error: e.message })
    }
  }

  return json(res, 405, { error: 'Method Not Allowed' })
}

export async function handlePushCheck(req, res) {
  // 驗證 secret
  if (req.headers['x-push-secret'] !== process.env.PUSH_CHECK_SECRET) {
    return json(res, 401, { error: 'Unauthorized' })
  }

  // 盤中判斷（UTC+8）
  const now    = new Date()
  const twHour = (now.getUTCHours() + 8) % 24
  const twMin  = now.getUTCMinutes()
  const twDay  = (now.getUTCDay() + (now.getUTCHours() >= 16 ? 1 : 0)) % 7
  const isTrading = twDay >= 1 && twDay <= 5
    && (twHour > 9 || (twHour === 9 && twMin >= 0))
    && (twHour < 13 || (twHour === 13 && twMin <= 30))
  if (!isTrading) return json(res, 200, { skipped: true })

  // 取得所有訂閱
  let cursor = '0'
  const subKeys = []
  do {
    const [nextCursor, keys] = await getRedis().scan(cursor, { match: 'sub:*', count: 100 })
    cursor = String(nextCursor)
    subKeys.push(...keys)
  } while (cursor !== '0')

  if (!subKeys.length) return json(res, 200, { sent: 0 })

  const subs = await Promise.all(subKeys.map(k => getRedis().get(k)))

  // 彙整不重複股票（保留 market）
  const stockMap = new Map()
  subs.forEach(s => {
    if (!s?.stocks) return
    s.stocks.forEach(({ code, market }) => {
      if (!stockMap.has(code)) stockMap.set(code, market)
    })
  })
  const stocks = [...stockMap.entries()].map(([code, market]) => ({ code, market }))
  if (!stocks.length) return json(res, 200, { sent: 0 })

  // 批次取現價（MIS）
  let prices = {}
  try {
    const misData = await fetchMis(stocks)
    ;(misData.msgArray || []).forEach(s => {
      const price = parseMisPrice(s)
      if (price) prices[s.c] = price
    })
  } catch { /* MIS 失敗時 prices 為空，各股個別跳過 */ }

  // 對每支股票評估是否推播
  const alerts = {}   // code → alert message
  for (const { code, market } of stocks) {
    const price = prices[code]
    if (price == null) continue

    let high = parseFloat(await getRedis().zscore('highs', code))

    // highs 尚無此股：補抓 Yahoo
    if (isNaN(high)) {
      try {
        high = await fetchYahoo(code, market)
        await getRedis().zadd('highs', { score: high, member: code, gt: true })
      } catch { continue }
      continue  // 首次抓取，本輪跳過推播
    }

    // 更新高點（ZADD GT：只在更大時更新）
    if (price > high) {
      await getRedis().zadd('highs', { score: price, member: code, gt: true })
      await getRedis().del(`notified:${code}`)
      continue  // 創新高，跳過推播
    }

    const pullback = (high - price) / high

    // 找最深已觸及關卡
    let currentLevel = null
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (pullback >= LEVELS[i]) { currentLevel = LEVELS[i]; break }
    }
    if (currentLevel == null) {
      // 未跌破任何關卡，檢查是否需解除鎖定
      const stored = await getRedis().get(`notified:${code}`)
      if (stored && pullback < stored.level - BUFFER) {
        await getRedis().del(`notified:${code}`)
      }
      continue
    }

    const stored = await getRedis().get(`notified:${code}`)

    // 解除鎖定：回升超過緩衝
    if (stored && pullback < stored.level - BUFFER) {
      await getRedis().del(`notified:${code}`)
      continue
    }

    // 觸發條件：尚無通知紀錄，或跌破更深關卡
    if (!stored || currentLevel > stored.level) {
      await getRedis().set(`notified:${code}`, { level: currentLevel, notifiedAt: now.toISOString() })
      const pct = Math.round(currentLevel * 100)
      alerts[code] = `${code} 已回檔 ${pct}%（現價 ${price}，高點 ${high}）`
    }
  }

  // 對每筆訂閱推播
  ensureVapid()
  const alertCodes = Object.keys(alerts)
  let sentCount = 0
  if (alertCodes.length > 0) {
    const body = alertCodes.length === 1
      ? alerts[alertCodes[0]]
      : `${alertCodes.length} 支個股觸發回檔關卡：${alertCodes.join('、')}`

    const payload = JSON.stringify({ title: '回檔提醒', body })

    await Promise.allSettled(
      subKeys.map(async (key, i) => {
        const sub = subs[i]
        if (!sub?.subscription) return
        const deviceStocks = (sub.stocks || []).map(s => s.code)
        const relevant = alertCodes.filter(c => deviceStocks.includes(c))
        if (!relevant.length) return
        try {
          await webpush.sendNotification(sub.subscription, payload)
          sentCount++
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await getRedis().del(key)
          }
        }
      })
    )
  }

  return json(res, 200, { sent: sentCount, alerts: alertCodes })
}
