/* ============================================================
   ui.js — Sidebar, theme, nav, page transitions
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* --- Sidebar toggle (mobile) --- */
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('overlay');
  const menuBtn  = document.getElementById('menuBtn');
  const closeBtn = document.getElementById('sidebarToggle');

  function openSidebar()  { sidebar?.classList.add('open');    overlay?.classList.add('active');    document.body.style.overflow = 'hidden'; }
  function closeSidebar() { sidebar?.classList.remove('open'); overlay?.classList.remove('active'); document.body.style.overflow = ''; }

  menuBtn?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  /* --- Theme --- */
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon   = document.getElementById('themeIcon');
  const themeLabel  = themeToggle?.querySelector('span:last-child');
  const html        = document.documentElement;

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('ft_theme', theme);
    if (themeIcon)  themeIcon.textContent  = theme === 'light' ? '🌙' : '☀️';
    if (themeLabel) themeLabel.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
  }

  const savedTheme = localStorage.getItem('ft_theme') || 'dark';
  applyTheme(savedTheme);

  themeToggle?.addEventListener('click', () => {
    applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* --- Active nav link --- */
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item, .bottom-nav__item').forEach(link => {
    const href = link.getAttribute('href') || '';
    link.classList.toggle('active', href.split('/').pop() === currentPath);
  });

  /* --- Page transitions on nav clicks --- */
  document.querySelectorAll('a.nav-item, a.bottom-nav__item, .btn[href]').forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      closeSidebar();
      document.body.classList.add('page-exit');
      setTimeout(() => { window.location.href = href; }, 150);
    });
  });

  /* --- Redraw charts on resize --- */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (typeof initDashboard === 'function') initDashboard().catch(console.error); }, 200);
  });
});
