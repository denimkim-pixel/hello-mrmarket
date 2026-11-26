// 헬로 미스터마켓 · 경제지표 동기화 (/api/macro) — 키 없음: FRED 공개 CSV + 야후(VIX) + multpl(CAPE)
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const FRED = { DGS10: '10y', DGS2: '2y', T10Y2Y: 'spread', DFEDTARU: 'fed', CPIAUCSL: 'cpi', CPILFESL: 'core', UNRATE: 'unrate', SAHMREALTIME: 'sahm', BAMLH0A0HYM2: 'hy' };

async function fred(id) {
  const since = new Date(Date.now() - 800 * 864e5).toISOString().slice(0, 10);
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${since}`, { headers: UA }); if (!r.ok) return null;
  const rows = (await r.text()).trim().split('\n').slice(1).map((l) => l.split(',')).map(([d, v]) => [d, parseFloat(v)]).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && isFinite(v));
  return rows.length ? rows : null;
}
async function vix() {
  try { const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1y&interval=1d', { headers: UA }); const res = (await r.json())?.chart?.result?.[0]; const c = res.indicators.quote[0].close; const t = res.timestamp; const rows = t.map((x, i) => [new Date(x * 1000).toISOString().slice(0, 10), c[i]]).filter(([, v]) => v > 0); const lp = res.meta.regularMarketPrice; if (lp > 0) rows.push([new Date(res.meta.regularMarketTime * 1000).toISOString().slice(0, 10), lp]); return rows; } catch (e) { return null; }
}
async function cape() {
  try { const r = await fetch('https://www.multpl.com/shiller-pe', { headers: UA }); const h = await r.text(); const m = h.match(/Current Shiller PE Ratio[^0-9]*([0-9]+\.[0-9]+)/i) || h.match(/id="current"[\s\S]{0,400}?([0-9]{1,3}\.[0-9]{1,2})/); return m ? +m[1] : null; } catch (e) { return null; }
}
const back = (rows, days) => { const t = new Date(rows[rows.length - 1][0]).getTime() - days * 864e5; let v = null; for (const [d, x] of rows) { if (new Date(d).getTime() <= t) v = x; else break; } return v; };
const yoy = (rows) => rows.map(([d, v], i) => { const j = rows.findIndex(([d2]) => d2 === (+d.slice(0, 4) - 1) + d.slice(4)); return j >= 0 ? [d, +((v / rows[j][1] - 1) * 100).toFixed(2)] : null; }).filter(Boolean);

export default async () => {
  const ids = Object.keys(FRED);
  const [vals, vx, cp] = await Promise.all([Promise.all(ids.map((id) => fred(id).catch(() => null))), vix(), cape()]);
  const S = {}; ids.forEach((id, i) => { if (vals[i]) S[FRED[id]] = vals[i]; });
  if (S.cpi) S.cpi = yoy(S.cpi); if (S.core) S.core = yoy(S.core); if (vx) S.vix = vx;
  const out = {};
  Object.entries(S).forEach(([k, rows]) => { if (!rows || !rows.length) return; const [d, v] = rows[rows.length - 1]; const monthly = ['cpi', 'core', 'unrate', 'sahm'].includes(k); out[k] = { v: +v.toFixed(2), d, p3: back(rows, monthly ? 92 : 91), p12: back(rows, 365) }; });
  if (cp) out.cape = { v: cp, d: new Date().toISOString().slice(0, 10) };
  if (!Object.keys(out).length) return new Response(JSON.stringify({ error: 'no data' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ asof: new Date().toISOString(), m: out }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
};
export const config = { path: '/api/macro' };
