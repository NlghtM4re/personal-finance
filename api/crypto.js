/* ============================================================
   api/crypto.js — Vercel serverless proxy for CoinGecko.
   The browser calling CoinGecko directly hit CORS failures and a
   429 rate-limit storm (each user, each page, fresh calls). This
   proxies those two endpoints server-side with an in-memory cache
   plus CDN cache headers, so the whole site shares a handful of
   upstream calls. Same-origin, so no CORS in the browser.

   Query:
     ?type=markets&vs=cad&ids=bitcoin,solana
     ?type=chart&coin=bitcoin&vs=cad&days=1
   ============================================================ */

const CACHE = new Map();                 // url -> { ts, data }
const TTL = { markets: 60 * 1000, chart: 10 * 60 * 1000 };
const MAXAGE = { markets: 60, chart: 600 };

module.exports = async (req, res) => {
  const q = req.query || {};
  const type = q.type === 'chart' ? 'chart' : 'markets';
  const vs   = String(q.vs || 'usd').toLowerCase().replace(/[^a-z]/g, '').slice(0, 8) || 'usd';

  let url;
  if (type === 'chart') {
    const coin = String(q.coin || 'bitcoin').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    const days = String(q.days || '1').replace(/[^0-9]/g, '').slice(0, 5) || '1';
    url = `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=${vs}&days=${days}`;
  } else {
    const ids = String(q.ids || 'bitcoin,solana').toLowerCase().replace(/[^a-z0-9,-]/g, '').slice(0, 200);
    url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&ids=${ids}&sparkline=true&price_change_percentage=24h`;
  }

  const sMaxAge = MAXAGE[type];
  const hit = CACHE.get(url);
  const fresh = hit && (Date.now() - hit.ts < TTL[type]);

  if (fresh) {
    res.setHeader('Cache-Control', `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 6}`);
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(hit.data);
  }

  try {
    const upstream = await fetch(url, { headers: { accept: 'application/json' } });
    if (!upstream.ok) {
      if (hit) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(hit.data); }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: `upstream ${upstream.status}` });
    }
    const data = await upstream.json();
    CACHE.set(url, { ts: Date.now(), data });
    res.setHeader('Cache-Control', `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 6}`);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    if (hit) { res.setHeader('X-Cache', 'STALE-ERR'); return res.status(200).json(hit.data); }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: String((err && err.message) || err) });
  }
};
