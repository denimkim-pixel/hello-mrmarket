// 임시 진단: 어떤 시세·지표 출처가 Netlify 서버에서 통하는지 확인
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: '*/*' };
async function probe(name, url, opt = {}) {
  const t = Date.now();
  try { const r = await fetch(url, { headers: { ...UA, ...(opt.h || {}) }, signal: AbortSignal.timeout(6000), redirect: 'follow' }); const txt = await r.text(); return { name, status: r.status, ms: Date.now() - t, len: txt.length, head: txt.slice(0, 160).replace(/\s+/g, ' '), setCookie: (r.headers.get('set-cookie') || '').slice(0, 80) }; }
  catch (e) { return { name, err: String(e && e.name || e), ms: Date.now() - t }; }
}
async function yahooCrumb() {
  const t = Date.now();
  try {
    const r1 = await fetch('https://fc.yahoo.com', { headers: UA, signal: AbortSignal.timeout(5000), redirect: 'manual' });
    const ck = (r1.headers.get('set-cookie') || '').split(';')[0];
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...UA, Cookie: ck }, signal: AbortSignal.timeout(5000) });
    const crumb = await r2.text();
    const r3 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d&crumb=${encodeURIComponent(crumb)}`, { headers: { ...UA, Cookie: ck }, signal: AbortSignal.timeout(5000) });
    const b = await r3.text();
    return { name: 'yahoo+crumb', c1: r1.status, ck: !!ck, c2: r2.status, crumb: crumb.slice(0, 20), status: r3.status, head: b.slice(0, 120), ms: Date.now() - t };
  } catch (e) { return { name: 'yahoo+crumb', err: String(e && e.name || e), ms: Date.now() - t }; }
}
export default async () => {
  const now = Math.floor(Date.now() / 1000), d0 = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
  const res = await Promise.all([
    probe('yahoo q1 chart', `https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d`),
    probe('yahoo q2 chart', `https://query2.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d`),
    yahooCrumb(),
    probe('stooq spy', 'https://stooq.com/q/d/l/?s=spy.us&i=d'),
    probe('nasdaq hist', `https://api.nasdaq.com/api/quote/SPY/historical?assetclass=etf&fromdate=${d0}&limit=5`, { h: { Accept: 'application/json', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' } }),
    probe('naver kr 069500', `https://api.finance.naver.com/siseJson.naver?symbol=069500&requestType=1&startTime=${d0.replace(/-/g, '')}&endTime=20991231&timeframe=day`),
    probe('fred graph csv', `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=${d0}`),
    probe('fred api (no key)', 'https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json&limit=1'),
    probe('treasury yields', `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${new Date().getFullYear()}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${new Date().getFullYear()}&page&_format=csv`),
    probe('multpl cape', 'https://www.multpl.com/shiller-pe'),
    probe('cboe vix csv', 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv'),
    probe('frankfurter fx', `https://api.frankfurter.app/${d0}..?from=USD&to=KRW`),
  ]);
  return new Response(JSON.stringify({ at: new Date().toISOString(), env: { fredKey: !!process.env.FRED_API_KEY, tiingo: !!process.env.TIINGO_TOKEN }, res }, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
};
export const config = { path: '/api/diag' };
