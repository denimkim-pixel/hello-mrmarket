// 헬로 미스터마켓 · 시세 동기화 (update_prices.py와 같은 형식의 price-history.csv를 서버에서 만들어 돌려줌)
// 키 없음: 야후 파이낸스 일별 차트(배당 조정 종가) + 오늘 장중 가격
const KR_MAP = { KOFR: '449170' };
const APP = ['SPY', 'QQQ', 'TQQQ', 'SOXL', 'SGOV', 'SCHD', 'JEPQ', 'XLV', 'XLF', 'XLE', 'XLI', 'KOFR', '069500'];
const START = Math.floor(Date.UTC(2010, 0, 1) / 1000);
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json' };

const symbols = (t) => { t = KR_MAP[t] || t; return /^\d{6}$/.test(t) ? [t + '.KS', t + '.KQ'] : [t.replace('.', '-')]; };
const day = (sec, off) => new Date((sec + off) * 1000).toISOString().slice(0, 10);

async function chart(sym) {
  const now = Math.floor(Date.now() / 1000);
  for (const host of ['query1', 'query2']) {
    try {
      const u = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${START}&period2=${now}&interval=1d&events=div%2Csplit&includeAdjustedClose=true`;
      const r = await fetch(u, { headers: UA }); if (!r.ok) continue;
      const res = (await r.json())?.chart?.result?.[0]; if (!res || !res.timestamp) continue;
      const off = res.meta?.gmtoffset || 0, q = res.indicators || {}, adj = q.adjclose?.[0]?.adjclose || q.quote?.[0]?.close || [];
      const m = new Map(); res.timestamp.forEach((t, i) => { const v = adj[i]; if (v > 0) m.set(day(t, off), v); });
      const lp = res.meta?.regularMarketPrice, lt = res.meta?.regularMarketTime;
      if (lp > 0 && lt) { const d = day(lt, off); if (!m.has(d) || d === [...m.keys()].pop()) m.set(d, lp); }
      if (m.size) return { m, last: lp, time: lt };
    } catch (e) { }
  }
  return null;
}
async function first(t) { for (const s of symbols(t)) { const c = await chart(s); if (c) return c; } return null; }
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }

export default async (req) => {
  const url = new URL(req.url);
  const extra = (url.searchParams.get('t') || '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(s));
  const list = [...new Set(APP.concat(extra))].slice(0, 60);
  const [series, fx] = await Promise.all([pool(list, 8, first), chart('KRW=X')]);
  const cols = [], miss = [];
  list.forEach((t, i) => { if (series[i]) cols.push([t, series[i].m]); else miss.push(t); });
  if (fx) cols.push(['USDKRW', fx.m]);
  if (!cols.length) return new Response('야후 시세를 받지 못했어요', { status: 502 });
  const dates = [...new Set(cols.flatMap(([, m]) => [...m.keys()]))].filter((d) => d >= '2010-01-01').sort();
  const last = cols.map(() => null), lines = ['Date,' + cols.map(([k]) => k).join(',')];
  dates.forEach((d) => { lines.push(d + ',' + cols.map(([, m], j) => { const v = m.get(d); if (v > 0) last[j] = v; return last[j] == null ? '' : +last[j].toFixed(4); }).join(',')); });
  return new Response('﻿' + lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-HMM-Missing': miss.join(','), 'X-HMM-Asof': new Date().toISOString() },
  });
};
export const config = { path: '/api/prices' };
