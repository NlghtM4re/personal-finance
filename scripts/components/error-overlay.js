/* ============================================================
   error-overlay.js — on-screen console error reporter.
   Surfaces console.error / console.warn, uncaught errors and
   unhandled promise rejections as dismissible toasts in the
   bottom-left corner, so problems on the live site are visible
   without opening DevTools. Load this FIRST on every page.
   Toggle off by setting localStorage 'pf_debug' to '0'.
   ============================================================ */
(function () {
  'use strict';
  if (window.__pfErrorOverlay) return;
  window.__pfErrorOverlay = true;

  try { if (localStorage.getItem('pf_debug') === '0') return; } catch (_) {}

  /* self-inject styles so the overlay works on every page, even ones that
     don't link the shared stylesheet (e.g. login.html). */
  const CSS = `
.err-overlay{position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;flex-direction:column-reverse;gap:6px;max-width:min(380px,calc(100vw - 24px));pointer-events:none}
.err-toast{pointer-events:auto;background:#1a0f12;border:1px solid #ff5c7a;border-left-width:3px;padding:8px 10px;box-shadow:0 6px 28px rgba(0,0,0,.7);font-family:'JetBrains Mono','Consolas',monospace}
.err-toast--warn{background:#1a160d;border-color:#d4a64a}
.err-toast__head{display:flex;align-items:center;gap:8px;margin-bottom:3px}
.err-toast__kind{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#ff5c7a}
.err-toast--warn .err-toast__kind{color:#d4a64a}
.err-toast__count{font-size:9px;color:#6e6e78}
.err-toast__close{margin-left:auto;background:none;border:none;color:#6e6e78;cursor:pointer;font-size:12px;line-height:1;padding:2px}
.err-toast__close:hover{color:#f4f4f6}
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
      head.innerHTML = `<span class="err-toast__kind">${kind}</span><span class="err-toast__count" hidden></span><button class="err-toast__close" aria-label="Dismiss" title="Dismiss">✕</button>`;
      const body = document.createElement('div');
      body.className = 'err-toast__msg';
      body.textContent = text.length > 600 ? text.slice(0, 600) + '…' : text;
      el.appendChild(head); el.appendChild(body);
      head.querySelector('.err-toast__close').addEventListener('click', () => { el.remove(); if (el === lastEl) { lastEl = null; lastKey = ''; } });
      c.appendChild(el);
      lastEl = el;
      while (c.children.length > MAX) c.firstChild.remove();
    };
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  }

  /* wrap console.error / console.warn (keep originals working) */
  ['error', 'warn'].forEach((level) => {
    const orig = console[level] ? console[level].bind(console) : function () {};
    console[level] = function (...args) {
      orig(...args);
      try { show(level, args.map(fmt).join(' ')); } catch (_) {}
    };
  });

  window.addEventListener('error', (e) => {
    if (e && e.message) {
      const where = e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno || 0})` : '';
      show('error', e.message + where);
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    show('error', 'Unhandled rejection: ' + (r && r.message ? r.message : fmt(r)));
  });
})();
