/* ============================================================
   error-overlay.js — error visibility, two audiences.
   1) DEBUG OVERLAY (developers): surfaces console.error/warn,
      uncaught errors and unhandled rejections as dismissible
      toasts. OPT-IN — set localStorage 'pf_debug' to '1'.
      (Public users should never see dev noise.)
   2) SILENT REPORTING (production): uncaught errors and
      unhandled rejections are POSTed, throttled and fire-and-
      forget, to /api/log-error so they land in the host's
      function logs. Skipped on localhost. No user data — just
      message, script location, page path, and user agent.
   Load this FIRST on every page.
   ============================================================ */
(function () {
  'use strict';
  if (window.__pfErrorOverlay) return;
  window.__pfErrorOverlay = true;

  let DEBUG = false;
  try { DEBUG = localStorage.getItem('pf_debug') === '1'; } catch (_) {}

  /* ---- silent production reporting (max 5/page, localhost excluded) ---- */
  const IS_LOCAL = /^(localhost|127\.|::1|\[::1\])/.test(location.hostname);
  let reported = 0;
  function report(message, source) {
    if (IS_LOCAL || reported >= 5) return;
    reported++;
    try {
      const body = JSON.stringify({
        message: String(message || '').slice(0, 500),
        source:  String(source || '').slice(0, 200),
        page:    location.pathname,
        ua:      navigator.userAgent.slice(0, 200),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/log-error', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/log-error', { method: 'POST', body, keepalive: true,
          headers: { 'content-type': 'application/json' } }).catch(() => {});
      }
    } catch (_) {}
  }

  /* self-inject styles so the overlay works on every page, even ones that
     don't link the shared stylesheet (e.g. login.html). */
  const CSS = `
.err-overlay{position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;flex-direction:column-reverse;gap:6px;max-width:min(380px,calc(100vw - 24px));pointer-events:none}
.err-toast{pointer-events:auto;background:#1a0f12;border:1px solid #ff5c7a;border-left-width:3px;padding:8px 10px;box-shadow:0 6px 28px rgba(0,0,0,.7);font-family:'JetBrains Mono','Consolas',monospace}
.err-toast--warn{background:#1a160d;border-color:#d4a64a}
.err-toast__head{display:flex;align-items:center;gap:8px;margin-bottom:3px}
.err-toast__kind{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#ff5c7a}
.err-toast--warn .err-toast__kind{color:#d4a64a}
.err-toast__count{font-size:9px;color:#8a8a94}
.err-toast__copy{margin-left:auto;background:none;border:none;color:#8a8a94;cursor:pointer;font-size:12px;line-height:1;padding:2px 4px}
.err-toast__close{background:none;border:none;color:#8a8a94;cursor:pointer;font-size:12px;line-height:1;padding:2px}
.err-toast__copy:hover,.err-toast__close:hover{color:#f4f4f6}
.err-toast__msg{font-size:11px;line-height:1.45;color:#f4f4f6;white-space:pre-wrap;word-break:break-word;max-height:140px;overflow-y:auto;margin:0}`;
  function injectStyles() {
    if (document.getElementById('errOverlayStyle')) return;
    const s = document.createElement('style');
    s.id = 'errOverlayStyle';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  const MAX = 8;
  let container = null;

  function ensure() {
    injectStyles();
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.className = 'err-overlay';
    container.setAttribute('aria-live', 'polite');
    (document.body || document.documentElement).appendChild(container);
    return container;
  }

  function fmt(a) {
    if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }

  /* collapse identical repeats into a counter instead of stacking */
  let lastKey = '';
  let lastEl = null;
  let lastCount = 1;

  function show(kind, text) {
    if (!text) return;
    const run = () => {
      const c = ensure();
      const key = kind + '|' + text;
      if (key === lastKey && lastEl && c.contains(lastEl)) {
        lastCount++;
        lastEl.querySelector('.err-toast__count').textContent = '×' + lastCount;
        lastEl.querySelector('.err-toast__count').hidden = false;
        return;
      }
      lastKey = key; lastCount = 1;
      const el = document.createElement('div');
      el.className = 'err-toast err-toast--' + (kind === 'warn' ? 'warn' : 'error');
      const head = document.createElement('div');
      head.className = 'err-toast__head';
      head.innerHTML = `<span class="err-toast__kind">${kind}</span><span class="err-toast__count" hidden></span><button class="err-toast__copy" aria-label="Copy" title="Copy">⧉</button><button class="err-toast__close" aria-label="Dismiss" title="Dismiss">✕</button>`;
      const body = document.createElement('div');
      body.className = 'err-toast__msg';
      body.textContent = text.length > 600 ? text.slice(0, 600) + '…' : text;
      el.appendChild(head); el.appendChild(body);
      const copyBtn = head.querySelector('.err-toast__copy');
      copyBtn.addEventListener('click', async () => {
        const full = lastCount > 1 ? `(${lastCount}×) ${text}` : text;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(full);
          else { const ta = document.createElement('textarea'); ta.value = full; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
          copyBtn.textContent = '✓';
          setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200);
        } catch (_) { copyBtn.textContent = '✕'; setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200); }
      });
      head.querySelector('.err-toast__close').addEventListener('click', () => { el.remove(); if (el === lastEl) { lastEl = null; lastKey = ''; } });
      c.appendChild(el);
      lastEl = el;
      while (c.children.length > MAX) c.firstChild.remove();
    };
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  }

  /* wrap console.error / console.warn (debug overlay only, originals kept) */
  if (DEBUG) {
    ['error', 'warn'].forEach((level) => {
      const orig = console[level] ? console[level].bind(console) : function () {};
      console[level] = function (...args) {
        orig(...args);
        try { show(level, args.map(fmt).join(' ')); } catch (_) {}
      };
    });
  }

  window.addEventListener('error', (e) => {
    if (e && e.message) {
      const where = e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno || 0})` : '';
      if (DEBUG) show('error', e.message + where);
      report(e.message, where);
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    const msg = 'Unhandled rejection: ' + (r && r.message ? r.message : fmt(r));
    if (DEBUG) show('error', msg);
    report(msg, r && r.stack ? String(r.stack).split('\n')[1] : '');
  });
})();
