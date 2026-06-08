/* ============================================================
   accounts.js — Accounts page (async)
   ============================================================ */

const ACCOUNT_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#ec4899','#84cc16','#14b8a6',
];

let editingAccountId = null;

async function initAccounts() {
  await renderAccountsGrid();
  await renderAccountSummary();
}

async function renderAccountSummary() {
  const accounts = await AccountStore.getAll();
  const balances = await Promise.all(accounts.map(a => AccountStore.getBalance(a.id)));
  const withBal  = accounts.map((a, i) => ({ ...a, bal: balances[i] }));

  const debtTypes = new Set(['credit']);
  const assets = withBal.filter(a => !debtTypes.has(a.type));
  const debts  = withBal.filter(a =>  debtTypes.has(a.type));

  const totalAssets = assets.reduce((s, a) => s + Math.max(0, a.bal), 0);
  const totalDebts  = debts.reduce((s, a)  => s + Math.abs(Math.min(0, a.bal)), 0);
  const netWorth    = totalAssets - totalDebts;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('accTotalAssets', formatCurrency(totalAssets));
  setText('accTotalDebts',  formatCurrency(totalDebts));
  setText('accCount',       String(accounts.length));
  setText('accNetWorth',    (netWorth >= 0 ? '+' : '') + formatCurrency(netWorth));

  const nwEl = document.getElementById('accNetWorth');
  if (nwEl) nwEl.style.color = netWorth >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  const barFill = document.getElementById('accNwBarFill');
  if (barFill) {
    const total = totalAssets + totalDebts;
    barFill.style.width = total > 0 ? `${((totalAssets / total) * 100).toFixed(1)}%` : '100%';
  }
}

const TYPE_LABEL = { bank: 'Bank', cash: 'Cash', savings: 'Savings', investment: 'Investment', credit: 'Credit', other: 'Other' };

async function renderAccountsGrid() {
  const el = document.getElementById('accountsGrid');
  if (!el) return;

  el.innerHTML = [1, 2].map(() => `
    <div class="acc-row">
      <div class="acc-row__avatar skeleton" style="width:38px;height:38px;border-radius:10px;flex-shrink:0;"></div>
      <div class="acc-row__info">
        <div class="skeleton skeleton-text" style="width:60%;"></div>
        <div class="skeleton skeleton-text" style="width:35%;margin-top:4px;"></div>
      </div>
      <div class="skeleton skeleton-text" style="width:60px;margin-left:auto;"></div>
    </div>`).join('');

  const accounts = await AccountStore.getAll();
  const balances = await Promise.all(accounts.map(a => AccountStore.getBalance(a.id)));

  if (!accounts.length) {
    el.innerHTML = `<div class="empty-state" style="padding:24px 0;">No accounts yet.</div>`;
  } else {
    el.innerHTML = accounts.map((a, i) => {
      const bal    = balances[i];
      const letter = a.name.charAt(0).toUpperCase();
      return `
        <div class="acc-row" data-id="${a.id}">
          <div class="acc-row__avatar" style="background:${a.color}22;color:${a.color}">${letter}</div>
          <div class="acc-row__info">
            <div class="acc-row__name">${a.name}</div>
            <div class="acc-row__type">${TYPE_LABEL[a.type] || 'Account'}</div>
          </div>
          <div class="acc-row__right">
            <div class="acc-row__balance" style="color:${bal >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">${formatCurrency(bal)}</div>
            <div class="acc-row__actions">
              <button class="tx-action-btn" data-action="edit-acc" data-id="${a.id}" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="tx-action-btn tx-action-btn--delete" data-action="delete-acc" data-id="${a.id}" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  el.insertAdjacentHTML('beforeend', `
    <button class="acc-row acc-row--add" id="addAccountCard">
      <div class="acc-row__add-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      </div>
      <span>New Account</span>
    </button>`);

  document.getElementById('addAccountCard')?.addEventListener('click', () => openAccountModal(null));
  el.querySelectorAll('[data-action="edit-acc"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openAccountModal(btn.dataset.id); });
  });
  el.querySelectorAll('[data-action="delete-acc"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteAccount(btn.dataset.id); });
  });
}

async function openAccountModal(id) {
  editingAccountId = id || null;
  const modal = document.getElementById('accountModal');
  const title = document.getElementById('accountModalTitle');
  if (!modal) return;
  if (id) {
    const acc = await AccountStore.getById(id);
    if (acc) {
      setValue('accName',    acc.name);
      setValue('accType',    acc.type);
      setValue('accBalance', acc.initialBalance);
      setValue('accColor',   acc.color);
    }
    if (title) title.textContent = 'Edit Account';
  } else {
    document.getElementById('accForm')?.reset();
    const accounts = await AccountStore.getAll();
    setValue('accColor', ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]);
    if (title) title.textContent = 'New Account';
  }
  modal.classList.add('open');
}

async function deleteAccount(id) {
  const allTx   = await TransactionStore.getAll();
  const txCount = allTx.filter(t => t.accountId === id || t.toAccountId === id).length;

  const modal   = document.getElementById('deleteAccountModal');
  const msgEl   = document.getElementById('deleteAccountMsg');
  const confirm = document.getElementById('confirmDeleteAccount');
  if (!modal || !confirm) return;

  if (msgEl) {
    msgEl.textContent = txCount
      ? `This account has ${txCount} transaction${txCount !== 1 ? 's' : ''}. Deleting it will not remove those transactions. This cannot be undone.`
      : 'This action cannot be undone. The account will be permanently removed.';
  }

  modal.classList.add('open');
  confirm.onclick = async () => {
    confirm.classList.add('btn--loading');
    confirm.disabled = true;
    try {
      await AccountStore.delete(id);
      showToast('Account deleted', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete account', 'error');
    } finally {
      modal.classList.remove('open');
      confirm.classList.remove('btn--loading');
      confirm.disabled = false;
    }
    await renderAccountsGrid();
    await renderAccountSummary();
  };

  document.getElementById('cancelDeleteAccount')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
  document.getElementById('closeDeleteAccountModal')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
}

function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function capitalize(str)   { return str ? str[0].toUpperCase() + str.slice(1) : ''; }

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  try {
    await initAccounts();
  } catch (err) {
    console.error('Accounts error:', err);
    document.getElementById('accountsGrid').innerHTML = `<div class="empty-state" style="color:var(--color-expense)">Error: ${err.message}</div>`;
  }

  document.getElementById('accForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      name:           document.getElementById('accName').value.trim(),
      type:           document.getElementById('accType').value,
      initialBalance: parseFloat(document.getElementById('accBalance').value) || 0,
      color:          document.getElementById('accColor').value,
    };
    if (!data.name) return;
    if (editingAccountId) { await AccountStore.update(editingAccountId, data); showToast('Account updated', 'success'); }
    else                  { await AccountStore.add(data);                      showToast('Account created', 'success'); }
    document.getElementById('accountModal')?.classList.remove('open');
    await renderAccountsGrid();
    await renderAccountSummary();
  });

  document.getElementById('closeAccountModal')?.addEventListener('click', () => document.getElementById('accountModal')?.classList.remove('open'));
  document.getElementById('cancelAccount')?.addEventListener('click',     () => document.getElementById('accountModal')?.classList.remove('open'));
});
