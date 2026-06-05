// ── 交易時段判斷 ──────────────────────────────────────────
export function isTradingHours(d = new Date()) {
  const day = d.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const total = d.getHours() * 60 + d.getMinutes();
  return total >= 9 * 60 && total <= 13 * 60 + 30;
}

// ── 計算輔助函式 ──────────────────────────────────────────
export function retracement(stock) {
  return ((stock.price - stock.high5) / stock.high5) * 100;
}

export function severity(mag) {
  if (mag < 5) return 'mild';
  if (mag < 15) return 'warn';
  return 'bad';
}

export const SEV_COLOR = {
  mild: 'var(--sev-mild)',
  warn: 'var(--sev-warn)',
  bad:  'var(--sev-bad)',
};

export function nextLevel(stock) {
  const mag = Math.abs(retracement(stock));
  let pct = Math.ceil((mag + 1e-9) / 5) * 5;
  if (Math.abs(pct - mag) < 1e-6) pct += 5;
  pct = Math.min(pct, 95);
  const price = stock.high5 * (1 - pct / 100);
  return { pct, price, sev: severity(pct) };
}

export function fmt(n, dec = 2) {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  });
  return (neg ? '−' : '') + s;
}

export function fmtPct(n, dec = 1) {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return sign + Math.abs(n).toFixed(dec) + '%';
}
