const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function probe(name, url, h = UA, ms = 8000) { const t = Date.now(); try { const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(ms) }); const x = await r.text(); return { name, status: r.status, ms: Date.now() - t, len: x.length, head: x.slice(0, 200).replace(/\s+/g, ' ') }; } catch (e) { return { name, err: String(e && e.name || e), ms: Date.now() - t }; } }
export default async () => {
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const t0 = Date.now();
  const res = await Promise.all([
    probe('nasdaq SPY hist 400d', `https://api.nasdaq.com/api/quote/SPY/historical?assetclass=etf&fromdate=${from}&limit=9999`),
    probe('nasdaq SPY info', `https://api.nasdaq.com/api/quote/SPY/info?assetclass=etf`),
    probe('nasdaq SGOV divs', `https://api.nasdaq.com/api/quote/SGOV/dividends?assetclass=etf`),
    probe('nasdaq AAPL hist(etf)', `https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=etf&fromdate=${from}&limit=9999`),
    probe('nasdaq AAPL hist(stocks)', `https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks&fromdate=${from}&limit=9999`),
    probe('frankfurter', `https://api.frankfurter.app/${from}..?from=USD&to=KRW`, { 'User-Agent': UA['User-Agent'] }),
    probe('fred csv UNRATE 9s', `https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE&cosd=2024-06-01`, { 'User-Agent': UA['User-Agent'] }, 9000),
  ]);
  return new Response(JSON.stringify({ total: Date.now() - t0, res }, null, 1), { headers: { 'Content-Type': 'application/json' } });
};
export const config = { path: '/api/diag' };
