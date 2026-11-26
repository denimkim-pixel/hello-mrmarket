const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function probe(name, url, ms = 8000) { const t = Date.now(); try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); const x = await r.text(); return { name, status: r.status, ms: Date.now() - t, len: x.length }; } catch (e) { return { name, err: String(e && e.name || e), ms: Date.now() - t }; } }
export default async (req) => {
  const mode = new URL(req.url).searchParams.get('mode') || 'par';
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const syms = ['SPY', 'QQQ', 'TQQQ', 'SOXL', 'SGOV'];
  const u = (s) => `https://api.nasdaq.com/api/quote/${s}/historical?assetclass=etf&fromdate=${from}&limit=9999`;
  const t0 = Date.now(); let res = [];
  if (mode === 'seq') { for (const s of syms) res.push(await probe(s, u(s))); }
  else if (mode === 'short') { res = await Promise.all(syms.map((s) => probe(s, `https://api.nasdaq.com/api/quote/${s}/historical?assetclass=etf&fromdate=${from}&limit=5`))); }
  else res = await Promise.all(syms.map((s) => probe(s, u(s))));
  return new Response(JSON.stringify({ mode, total: Date.now() - t0, res }), { headers: { 'Content-Type': 'application/json' } });
};
export const config = { path: '/api/diag' };
