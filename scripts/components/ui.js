/* ============================================================
   ui.js — Theme, sidebar, nav, page transitions, shortcuts
   ============================================================ */

let _sidebarOpen = false;
let _sidebar, _overlay;

function openSidebar() {
  _sidebarOpen = true;
  _sidebar?.classList.add('open');
  _overlay?.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  _sidebarOpen = false;
  _sidebar?.classList.remove('open');
  _overlay?.classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {

  /* --- Sidebar toggle (mobile) --- */
  _sidebar = document.getElementById('sidebar');
  _overlay = document.getElementById('overlay');
  const menuBtn = document.getElementById('menuBtn');

  menuBtn?.addEventListener('click', openSidebar);
  _overlay?.addEventListener('click', closeSidebar);

  /* --- Theme --- */
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon   = document.getElementById('themeIcon');
  const html        = document.documentElement;

  const MOON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const SUN_SVG  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('ft_theme', theme);
    if (themeIcon) themeIcon.innerHTML = theme === 'dark' ? MOON_SVG : SUN_SVG;
  }

  const savedTheme = localStorage.getItem('ft_theme') || 'dark';
  applyTheme(savedTheme);

  /* canvas charts bake theme colors into pixels — re-render after a toggle */
  function redrawPageCharts() {
    if (typeof initDashboard  === 'function') { initDashboard().catch(() => {});  return; }
    if (typeof renderSpending === 'function') { renderSpending().catch(() => {}); return; }
    if (typeof renderPage     === 'function') { Promise.resolve(renderPage()).catch(() => {}); }
  }

  themeToggle?.addEventListener('click', () => {
    applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    redrawPageCharts();
  });
  document.getElementById('themeToggleTop')?.addEventListener('click', () => {
    applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    redrawPageCharts();
  });

  /* refresh server-side settings (currency) so every page picks up changes made on other devices */
  if (typeof SettingsStore !== 'undefined' && typeof SupaAuth !== 'undefined') {
    SettingsStore._load().catch(() => {});
  }

  /* PWA: register the service worker (https or localhost only) */
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  /* --- Active nav link (tolerates clean URLs; data-match lists extra pages, e.g. the Money tab) --- */
  const norm = p => (p.split('/').pop() || 'index.html').replace(/\.html$/, '');
  const currentPath = norm(window.location.pathname);
  document.querySelectorAll('.nav-item, .bottom-nav__item').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const matches = (link.dataset.match || href).split(',').map(norm);
    link.classList.toggle('active', matches.includes(currentPath));
  });

  /* --- Page transitions (nav + topbar + any internal link) --- */
  function navigateTo(href) {
    closeSidebar();
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = href; }, 130);
  }

  document.querySelectorAll(
    'a.nav-item, a.bottom-nav__item, .btn[href], a.topbar-nav-link, a.topbar-logo, a.money-tab, a.more-sheet__item'
  ).forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      navigateTo(href);
    });
  });

  /* --- Keyboard shortcuts --- */
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    /* N — new transaction */
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      const isInPages = window.location.pathname.includes('/pages/');
      navigateTo(isInPages ? 'add-transaction.html' : 'pages/add-transaction.html');
      return;
    }

    /* / — focus search */
    if (e.key === '/') {
      const searchEl = document.getElementById('searchInput');
      if (searchEl) { e.preventDefault(); searchEl.focus(); searchEl.select(); }
      return;
    }

    /* Escape — close modal / sidebar */
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal-overlay.open');
      if (openModal) { openModal.classList.remove('open'); return; }
      if (_sidebarOpen) { closeSidebar(); }
    }
  });

  /* --- Shortcut hint tooltip on search input --- */
  const searchEl = document.getElementById('searchInput');
  if (searchEl && !searchEl.placeholder.includes('/')) {
    searchEl.setAttribute('title', 'Press / to focus');
  }

  /* --- Redraw charts on resize (width-only: ignore mobile URL bar height changes) --- */
  let resizeTimer;
  let _lastInnerWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    if (w === _lastInnerWidth) return;
    _lastInnerWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (typeof initDashboard === 'function') initDashboard().catch(console.error);
    }, 250);
  });
});

/* --- Filter badge helper (called by transactions.js) --- */
function updateFilterBadge(filters) {
  const clearBtn = document.getElementById('clearFilters');
  if (!clearBtn) return;
  const activeCount = Object.values(filters).filter(v => v !== '').length;
  if (activeCount > 0) {
    clearBtn.innerHTML = `Clear <span class="filter-count">${activeCount}</span>`;
  } else {
    clearBtn.textContent = 'Clear';
  }
}

/* --- Number count-up animation --- */
function animateValue(el, endValue, formatter, duration = 550) {
  if (!el) return;
  const startValue = parseFloat(el.dataset.animFrom || '0');
  el.dataset.animFrom = String(endValue);
  /* rAF doesn't fire in background tabs — set the final value directly */
  if (document.hidden || Math.abs(endValue - startValue) < 0.01) { el.textContent = formatter(endValue); return; }
  const startTime = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  function tick(now) {
    const t = Math.min((now - startTime) / duration, 1);
    el.textContent = formatter(startValue + (endValue - startValue) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatter(endValue);
  }
  requestAnimationFrame(tick);
}

