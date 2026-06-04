/* ============================================================
   settings.js — Settings page logic
   ============================================================ */

function loadSavedSettings() {
  const url = localStorage.getItem('FINTRACK_API') || '';
  const key = localStorage.getItem('FINTRACK_KEY') || '';
  document.getElementById('apiUrl').value = url;
  document.getElementById('apiKey').value = key;
}

async function testConnection(url, key) {
  if (!url) return { ok: false, message: 'No server URL entered.' };
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['x-api-key'] = key;
    const base    = url.replace(/\/api\/?$/, '');
    const res     = await fetch(`${base}/health`, { headers, signal: AbortSignal.timeout(6000) });
    if (res.ok) return { ok: true,  message: 'Connected successfully.' };
    if (res.status === 401) return { ok: false, message: 'Wrong API key — check your Railway env var.' };
    return { ok: false, message: `Server responded with ${res.status}.` };
  } catch (e) {
    return { ok: false, message: 'Could not reach server. Check the URL and try again.' };
  }
}

function setBanner(state, message) {
  const banner = document.getElementById('statusBanner');
  const icon   = document.getElementById('statusIcon');
  const text   = document.getElementById('statusText');
  banner.className = `status-banner status-banner--${state}`;
  icon.textContent = state === 'ok' ? '✓' : state === 'error' ? '✕' : '⏳';
  text.textContent = message;
}

document.addEventListener('DOMContentLoaded', () => {
  loadSavedSettings();

  /* Check current connection on load */
  const savedUrl = localStorage.getItem('FINTRACK_API');
  const savedKey = localStorage.getItem('FINTRACK_KEY');
  if (savedUrl) {
    setBanner('checking', 'Checking connection…');
    testConnection(savedUrl, savedKey).then(result => {
      setBanner(result.ok ? 'ok' : 'error', result.ok ? `Connected to ${savedUrl}` : result.message);
    });
  } else {
    setBanner('none', 'Not connected — using local browser storage.');
  }

  /* Show/hide API key */
  document.getElementById('toggleKey')?.addEventListener('click', () => {
    const input = document.getElementById('apiKey');
    input.type  = input.type === 'password' ? 'text' : 'password';
  });

  /* Test button */
  document.getElementById('testBtn')?.addEventListener('click', async () => {
    const url = document.getElementById('apiUrl').value.trim();
    const key = document.getElementById('apiKey').value.trim();
    const btn = document.getElementById('testBtn');
    btn.classList.add('btn--loading');
    btn.disabled = true;
    setBanner('checking', 'Testing…');
    const result = await testConnection(url, key);
    setBanner(result.ok ? 'ok' : 'error', result.message);
    btn.classList.remove('btn--loading');
    btn.disabled = false;
  });

  /* Save form */
  document.getElementById('settingsForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const url = document.getElementById('apiUrl').value.trim();
    const key = document.getElementById('apiKey').value.trim();

    setBanner('checking', 'Connecting…');
    const result = await testConnection(url, key);

    if (result.ok) {
      localStorage.setItem('FINTRACK_API', url);
      localStorage.setItem('FINTRACK_KEY', key);
      setBanner('ok', `Connected to ${url}`);
      showToast('Settings saved — syncing with server now!', 'success');
    } else {
      setBanner('error', result.message);
      showToast(result.message, 'error');
    }
  });

  /* Disconnect */
  document.getElementById('clearBtn')?.addEventListener('click', () => {
    if (!confirm('Disconnect from server? The app will use local browser storage.')) return;
    localStorage.removeItem('FINTRACK_API');
    localStorage.removeItem('FINTRACK_KEY');
    document.getElementById('apiUrl').value = '';
    document.getElementById('apiKey').value = '';
    setBanner('none', 'Disconnected — using local browser storage.');
    showToast('Disconnected from server.');
  });

  /* Clear local data */
  document.getElementById('clearLocalBtn')?.addEventListener('click', () => {
    if (!confirm('Delete all local data on this device? This cannot be undone.')) return;
    ['ft_transactions','ft_accounts','ft_categories'].forEach(k => localStorage.removeItem(k));
    showToast('Local data cleared.');
  });
});

function showToast(message, type = '') {
  const container = document.getElementById('toastContainer') || (() => {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();
  const toast = document.createElement('div');
  toast.className = `toast${type ? ' toast--' + type : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
