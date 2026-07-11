/* ============================================================
   api/log-error.js — client error sink.
   The browser (error-overlay.js) POSTs uncaught errors here so
   they show up in the Vercel function logs — free, zero-setup
   error monitoring. Accepts small JSON only, per-instance
   rate-limited, stores nothing, returns 204 always (fire-and-
   forget on the client; nothing to act on).
   ============================================================ */

let windowStart = 0;
let count = 0;
const LIMIT = 60;                 // max logs per minute per instance
const WINDOW = 60 * 1000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }

  const now = Date.now();
  if (now - windowStart > WINDOW) { windowStart = now; count = 0; }
  if (++count > LIMIT) return res.status(204).end();

  try {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    b = b || {};
    const clean = (v, n) => String(v || '').replace(/[\r\n]+/g, ' ').slice(0, n);
    // console.error → visible in `vercel logs` / dashboard runtime logs
    console.error('[client-error]',
      JSON.stringify({
        message: clean(b.message, 500),
        source:  clean(b.source, 200),
        page:    clean(b.page, 200),
        ua:      clean(b.ua, 200),
        at:      new Date().toISOString(),
      }));
  } catch (_) { /* malformed body — ignore */ }

  return res.status(204).end();
};
