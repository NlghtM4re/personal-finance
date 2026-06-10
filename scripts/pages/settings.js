/* ============================================================
   settings.js — Settings page
   ============================================================ */

/* ---- Custom categories ---- */
async function renderCustomCats() {
  const cats    = await SettingsStore.getCustomCategories();
  const listEl  = document.getElementById('customCatsList');
  const divider = document.getElementById('customCatsDivider');
  if (!listEl) return;

  if (cats.length === 0) {
    listEl.innerHTML = '';
    if (divider) divider.style.display = 'none';
    return;
  }
  if (divider) divider.style.display = '';

  listEl.innerHTML = cats.map((c, i) => `
    <div class="settings-row" style="gap:10px;">
      <span style="font-size:1.2rem;width:32px;text-align:center;flex-shrink:0;">${escapeHTML(c.icon) || '🏷️'}</span>
      <div class="settings-row__info">
        <div class="settings-row__title">${escapeHTML(c.name)}</div>
        <div class="settings-row__sub">${escapeHTML(c.type)}</div>
      </div>
      <button type="button" class="btn btn--ghost btn--sm del-cat-btn" data-idx="${i}" style="flex-shrink:0;">Remove</button>
    </div>
    <div class="settings-divider"></div>
  `).join('');

  listEl.querySelectorAll('.del-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx  = parseInt(btn.dataset.idx);
      const cats = await SettingsStore.getCustomCategories();
      cats.splice(idx, 1);
      await SettingsStore.setCustomCategories(cats);
      renderCustomCats();
      showToast('Category removed', 'success');
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;

  const emailEl = document.getElementById('userEmail');
  if (emailEl) emailEl.textContent = user.email;

  /* Load counts */
  try {
    const [txs, accs] = await Promise.all([
      TransactionStore.getAll(),
      AccountStore.getAll(),
    ]);
    const txEl  = document.getElementById('txCount');
    const accEl = document.getElementById('accCount');
    if (txEl)  txEl.textContent  = `${txs.length} transaction${txs.length !== 1 ? 's' : ''}`;
    if (accEl) accEl.textContent = `${accs.length} account${accs.length !== 1 ? 's' : ''}`;
  } catch (_) {}

  /* Currency selector */
  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect) {
    SettingsStore.getCurrency().then(c => { currencySelect.value = c; });
    currencySelect.addEventListener('change', async () => {
      await SettingsStore.setCurrency(currencySelect.value);
      showToast('Currency updated', 'success');
    });
  }

  /* CSV export */
  document.getElementById('exportCsvBtn')?.addEventListener('click', async () => {
    try {
      await CSVService.export();
      showToast('CSV downloaded', 'success');
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    }
  });

  /* CSV import */
  document.getElementById('importCsvInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { imported, skipped } = await CSVService.import(file);
      showToast(`Imported ${imported} transaction${imported !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`, 'success');
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    }
    e.target.value = '';
  });

  /* Custom categories */
  await renderCustomCats();
  document.getElementById('addCatBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newCatName')?.value.trim();
    const icon = document.getElementById('newCatIcon')?.value.trim() || '🏷️';
    const type = document.getElementById('newCatType')?.value || 'expense';
    if (!name) { showToast('Enter a category name', 'error'); return; }
    const cats = await SettingsStore.getCustomCategories();
    cats.push({ id: 'custom-' + Date.now(), name, icon, type });
    await SettingsStore.setCustomCategories(cats);
    document.getElementById('newCatName').value = '';
    document.getElementById('newCatIcon').value = '';
    await renderCustomCats();
    showToast('Category added', 'success');
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await SupaAuth.signOut();
  });

  document.getElementById('deleteDataBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('deleteAllModal');
    if (!modal) return;
    modal.classList.add('open');
    document.getElementById('confirmDeleteAll').onclick = async () => {
      const btn = document.getElementById('confirmDeleteAll');
      btn.classList.add('btn--loading'); btn.disabled = true;
      try {
        await sb.from('transactions').delete().eq('user_id', user.id);
        await sb.from('subscriptions').delete().eq('user_id', user.id);     /* no-op if table not created yet */
        await sb.from('recurring_rules').delete().eq('user_id', user.id);   /* no-op if table not created yet */
        await sb.from('accounts').delete().eq('user_id', user.id);
        await SettingsStore.setBudgets({});
        await SettingsStore.setRecurringRules([]);
        await SettingsStore.setSubscriptions([]);
        await SettingsStore.setCustomCategories([]);
        showToast('All data deleted.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to delete data.', 'error');
      } finally {
        modal.classList.remove('open');
        btn.classList.remove('btn--loading'); btn.disabled = false;
      }
    };
    document.getElementById('cancelDeleteAll')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
    document.getElementById('closeDeleteAllModal')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
  });
});
