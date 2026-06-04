/* ============================================================
   settings.js — Settings page
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;

  const emailEl = document.getElementById('userEmail');
  if (emailEl) emailEl.textContent = user.email;

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await SupaAuth.signOut();
  });

  document.getElementById('deleteDataBtn')?.addEventListener('click', async () => {
    if (!confirm('Delete ALL your transactions and accounts? This cannot be undone.')) return;
    try {
      await sb.from('transactions').delete().eq('user_id', user.id);
      await sb.from('accounts').delete().eq('user_id', user.id);
      showToast('All data deleted.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete data.', 'error');
    }
  });
});
