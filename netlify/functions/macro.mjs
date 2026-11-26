// 헬로 미스터마켓 · 경제지표 동기화 (/api/macro)
// 금리: 미 재무부 일별 수익률 CSV / VIX: CBOE / 기준금리·물가·실업률·삼의 법칙·하이일드: FRED (환경변수 FRED_API_KEY가 있으면 공식 API, 없으면 공개 CSV 시도)
// 기준금리 예비: 뉴욕연준 EFFR / CAPE: multpl (실패하면 생략). 모든 요청은 시간 제한을 둬서 일부가 막혀도 나머지는 돌려줌.
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const iso = (d) => d.toISOString().slice(0, 10);
const mdy = (s) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
const get = async (url, ms = 6000) => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('http ' + r.status); return r.text(); };
const csvRows = (t) => t.trim().split(/\r?\n/).map((l) => l.split(',').map((x) => x.replace(/^"|"$/g, '').trim()));

async function treasury() {
  const y = new Date().getUTCFullYear(), out = { '10y': [], '2y': [] };
  const texts = await Promise.all([y - 1, y].map((yr) => get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${yr}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${yr}&page&_format=csv`).catch(() => '')));
  texts.forEach((t) => { if (!t) return; const g = csvRows(t), H = g[0], i10 = H.indexOf('10 Yr'), i2 = H.indexOf('2 Yr'); g.slice(1).forEach((r) => { const d = mdy(r[0]); if (!d) return; const a = parseFloat(r[i10]), b = parseFloat(r[i2]); if (isFinite(a)) out['10y'].push([d, a]); if (isFinite(b)) out['2y'].push([d, b]); }); });
  Object.values(out).forEach((a) => a.sort((p, q) => (p[0] < q[0] ? -1 : 1)));
  return out;
}
async function vix() {
  const t = await get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', 7000);
  return csvRows(t).slice(-800).map((r) => [mdy(r[0]), parseFloat(r[4])]).filter(([d, v]) => d && isFinite(v));
}
async function fred(id) {
  const since = iso(new Date(Date.now() - 800 * 864e5)), key = process.env.FRED_API_KEY;
  if (key) {
    const o = JSON.parse(await get(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${encodeURIComponent(key)}&file_type=json&observation_start=${since}`, 6000));
    return (o.observations || []).map((x) => [x.date, parseFloat(x.value)]).filter(([, v]) => isFinite(v));
  }
  const t = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${since}`, 7000);
  return csvRows(t).slice(1).map(([d, v]) => [d, parseFloat(v)]).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && isFinite(v));
}
async function effr() {
  const s = iso(new Date(Date.now() - 400 * 864e5)), e = iso(new Date());
  const o = JSON.parse(await get(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${s}&endDate=${e}`, 6000));
  return (o.refRates || []).map((x) => [x.effectiveDate, +x.percentRate]).filter(([d, v]) => d && isFinite(v)).sort((p, q) => (p[0] < q[0] ? -1 : 1));
}
async function cape() { const h = await get('https://www.multpl.com/shiller-pe', 5000); const m = h.match(/Current Shiller PE Ratio[^0-9]*([0-9]+\.[0-9]+)/i) || h.match(/id="current"[\s\S]{0,400}?([0-9]{1,3}\.[0-9]{1,2})/); return m ? +m[1] : null; }

const back = (rows, days) => { const t = new Date(rows[rows.length - 1][0]).getTime() - days * 864e5; let v = null; for (const [d, x] of rows) { if (new Date(d).getTime() <= t) v = x; else break; } return v; };
const yoy = (rows) => { const m = new Map(rows); return rows.map(([d, v]) => { const p = m.get((+d.slice(0, 4) - 1) + d.slice(4)); return p ? [d, +((v / p - 1) * 100).toFixed(2)] : null; }).filter(Boolean); };
const safe = (p) => p.catch(() => null);

export default async () => {
  const F = { fed: 'DFEDTARU', cpi: 'CPIAUCSL', core: 'CPILFESL', unrate: 'UNRATE', sahm: 'SAHMREALTIME', hy: 'BAMLH0A0HYM2' };
  const keys = Object.keys(F);
  const [tr, vx, cp, ef, ...fr] = await Promise.all([safe(treasury()), safe(vix()), safe(cape()), safe(effr()), ...keys.map((k) => safe(fred(F[k])))]);
  const S = {}, src = {};
  if (tr) { if (tr['10y'].length) S['10y'] = tr['10y']; if (tr['2y'].length) S['2y'] = tr['2y']; if (S['10y'] && S['2y']) { const m2 = new Map(S['2y']); S.spread = S['10y'].filter(([d]) => m2.has(d)).map(([d, v]) => [d, +(v - m2.get(d)).toFixed(2)]); } src.rates = 'treasury'; }
  keys.forEach((k, i) => { if (fr[i] && fr[i].length) { S[k] = fr[i]; src[k] = process.env.FRED_API_KEY ? 'fred-api' : 'fred-csv'; } });
  if (!S.fed && ef && ef.length) { S.fed = ef; src.fed = 'nyfed-effr'; }
  if (S.cpi) S.cpi = yoy(S.cpi); if (S.core) S.core = yoy(S.core);
  if (vx && vx.length) S.vix = vx;
  const out = {};
  Object.entries(S).forEach(([k, rows]) => { if (!rows || !rows.length) return; const [d, v] = rows[rows.length - 1]; out[k] = { v: +v.toFixed(2), d, p3: back(rows, 91), p12: back(rows, 365) }; });
  if (cp) out.cape = { v: cp, d: iso(new Date()) };
  const body = JSON.stringify({ asof: new Date().toISOString(), m: out, src, fredKey: !!process.env.FRED_API_KEY });
  return new Response(body, { status: Object.keys(out).length ? 200 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
};
export const config = { path: '/api/macro' };
