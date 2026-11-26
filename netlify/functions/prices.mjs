// 헬로 미스터마켓 · 시세 동기화 (/api/prices) — 키 없음
// 미국: 나스닥 일별 종가 + 배당 반영(배당락일 기준 과거가 조정) + 현재가 / 한국: 네이버 일별 종가 / 환율: Frankfurter(ECB)
// 한 번에 최대 8종목 (앱이 여러 묶음으로 나눠 동시에 요청) · 최근 약 400일만 돌려줌 (그래프 이어 붙이기 · 52주 최저가 · 현재가용). 백테스팅은 앱에 내장된 장기 데이터를 그대로 씀.
const KR_MAP = { KOFR: '449170' };
const ETF = new Set(['SPY', 'QQQ', 'TQQQ', 'SOXL', 'SGOV', 'SCHD', 'JEPQ', 'XLV', 'XLF', 'XLE', 'XLI', 'VOO', 'VTI', 'IVV', 'TLT', 'IEF', 'SHY', 'BIL', 'GLD', 'IAU', 'SLV', 'DIA', 'IWM', 'VT', 'VXUS', 'EFA', 'EEM', 'JEPI', 'SPLG', 'QQQM', 'SMH', 'SOXX', 'XLK', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'ARKK', 'UPRO', 'SQQQ', 'SPXL', 'BND', 'AGG', 'TMF', 'USD', 'SCHG', 'VUG', 'VIG', 'DGRO', 'COWZ']);
const DAYS = 400;
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const iso = (d) => d.toISOString().slice(0, 10);
const mdy = (s) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
const num = (s) => { const v = parseFloat(String(s == null ? '' : s).replace(/[$,]/g, '')); return isFinite(v) ? v : null; };
async function j(url, ms = 6000, h = UA) { const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }

async function nasdaq(sym) {
  const from = iso(new Date(Date.now() - DAYS * 864e5));
  const order = ETF.has(sym) ? ['etf', 'stocks'] : ['stocks', 'etf'];
  for (const ac of order) {
    const q = encodeURIComponent(sym);
    // 일별 종가 · 현재가 · 배당을 동시에 요청 (서버 시간 제한 10초 안에 끝내려고)
    const [h, inf, dv] = await Promise.all([
      j(`https://api.nasdaq.com/api/quote/${q}/historical?assetclass=${ac}&fromdate=${from}&limit=9999`, 6500).catch(() => null),
      j(`https://api.nasdaq.com/api/quote/${q}/info?assetclass=${ac}`, 5000).catch(() => null),
      j(`https://api.nasdaq.com/api/quote/${q}/dividends?assetclass=${ac}`, 5000).catch(() => null),
    ]);
    const rows = h?.data?.tradesTable?.rows; if (!rows || !rows.length) continue;
    const m = new Map(); rows.forEach((r) => { const d = mdy(r.date), c = num(r.close); if (d && c > 0) m.set(d, c); });
    if (!m.size) continue;
    try { const p = num(inf?.data?.primaryData?.lastSalePrice); const ts = String(inf?.data?.primaryData?.lastTradeTimestamp || ''); const dm = ts.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/); if (p > 0 && dm) m.set(iso(new Date(`${dm[1]} ${dm[2]}, ${dm[3]} 12:00 UTC`)), p); } catch (e) { }
    // 배당 반영: 배당락일 이전 가격을 (1 - 배당/전일종가)만큼 조정 → 야후 배당 조정 종가와 같은 방식
    try {
      const ds = (dv?.data?.dividends?.rows || []).map((r) => [mdy(r.exOrEffDate), num(r.amount)]).filter(([d, a]) => d && a > 0 && d >= from);
      const dates = [...m.keys()].sort();
      ds.forEach(([ex, amt]) => { const prev = dates.filter((d) => d < ex).pop(); if (!prev) return; const f = 1 - amt / m.get(prev); if (!(f > 0.5 && f < 1)) return; dates.forEach((d) => { if (d < ex) m.set(d, m.get(d) * f); }); });
    } catch (e) { }
    return m;
  }
  return null;
}
async function naver(code) {
  const s = iso(new Date(Date.now() - DAYS * 864e5)).replace(/-/g, ''), e = iso(new Date(Date.now() + 864e5)).replace(/-/g, '');
  try {
    const r = await fetch(`https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${s}&endTime=${e}&timeframe=day`, { headers: { 'User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(6000) });
    const t = await r.text(); const m = new Map();
    for (const x of t.matchAll(/\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/g)) m.set(`${x[1].slice(0, 4)}-${x[1].slice(4, 6)}-${x[1].slice(6)}`, +x[5]);
    return m.size ? m : null;
  } catch (er) { return null; }
}
async function fx() {
  try { const d0 = iso(new Date(Date.now() - DAYS * 864e5)); const o = await j(`https://api.frankfurter.app/${d0}..?from=USD&to=KRW`, 6000, { 'User-Agent': UA['User-Agent'] }); const m = new Map(); Object.entries(o.rates || {}).forEach(([d, v]) => { if (v && v.KRW > 0) m.set(d, v.KRW); }); try { const l = await j('https://api.frankfurter.app/latest?from=USD&to=KRW', 4000, { 'User-Agent': UA['User-Agent'] }); if (l?.rates?.KRW) m.set(l.date, l.rates.KRW); } catch (e) { } return m.size ? m : null; } catch (e) { return null; }
}
const one = (t) => { const k = KR_MAP[t] || t; return /^\d{6}$/.test(k) ? naver(k) : nasdaq(t); };
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } })); return out; }

export default async (req) => {
  const url = new URL(req.url);
  const extra = (url.searchParams.get('t') || '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(s));
  const list = [...new Set(extra)].slice(0, 8), wantFx = url.searchParams.get('fx') === '1';
  const [series, f] = await Promise.all([pool(list, 8, one), wantFx ? fx() : null]);
  const cols = [], miss = [];
  list.forEach((t, i) => { if (series[i]) cols.push([t, series[i]]); else miss.push(t); });
  if (f) cols.push(['USDKRW', f]);
  if (!cols.length) return new Response('시세 출처에 연결하지 못했어요', { status: 502 });
  const dates = [...new Set(cols.flatMap(([, m]) => [...m.keys()]))].sort();
  const last = cols.map(() => null), lines = ['Date,' + cols.map(([k]) => k).join(',')];
  dates.forEach((d) => { lines.push(d + ',' + cols.map(([, m], k) => { const v = m.get(d); if (v > 0) last[k] = v; return last[k] == null ? '' : +last[k].toFixed(4); }).join(',')); });
  return new Response('﻿' + lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-HMM-Missing': miss.join(','), 'X-HMM-Asof': new Date().toISOString() } });
};
export const config = { path: '/api/prices' };
