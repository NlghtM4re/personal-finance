/* ============================================================
   settings.js — Settings page
   ============================================================ */

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
        await sb.from('accounts').delete().eq('user_id', user.id);
        await SettingsStore.setBudgets({});
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
