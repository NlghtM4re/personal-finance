/* ============================================================
   ui.js — Shared UI behaviours: sidebar, theme, nav
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* --- Sidebar toggle (mobile) --- */
  const sidebar    = document.getElementById('sidebar');
  const overlay    = document.getElementById('overlay');
  const menuBtn    = document.getElementById('menuBtn');
  const closeBtn   = document.getElementById('sidebarToggle');

  function openSidebar() {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  menuBtn?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  /* Close on nav item click (mobile) */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', closeSidebar);
  });

  /* --- Dark mode --- */
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon   = document.getElementById('themeIcon');
  const html        = document.documentElement;

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('ft_theme', theme);
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /* Restore saved theme */
  const savedTheme = localStorage.getItem('ft_theme') || 'light';
  applyTheme(savedTheme);

  themeToggle?.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* --- Active nav link --- */
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item, .bottom-nav__item').forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkPage = href.split('/').pop();
    link.classList.toggle('active', linkPage === currentPath);
  });

  /* --- Redraw charts on resize --- */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (typeof initDashboard === 'function') initDashboard();
    }, 200);
  });
});
