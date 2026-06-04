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
}

async function renderAccountsGrid() {
  const el       = document.getElementById('accountsGrid');
  if (!el) return;
  const accounts = await AccountStore.getAll();
  const balances = await Promise.all(accounts.map(a => AccountStore.getBalance(a.id)));

  el.innerHTML = accounts.map((a, i) => {
    const bal = balances[i];
    return `
      <div class="card account-card" data-id="${a.id}">
        <div class="account-card__stripe" style="background:${a.color}"></div>
        <div class="account-card__header">
          <div>
            <div class="account-card__name">${a.name}</div>
            <div class="account-card__type">${capitalize(a.type)} Account</div>
          </div>
          <div class="account-card__actions">
            <button class="tx-action-btn" data-action="edit-acc" data-id="${a.id}" title="Edit">✏️</button>
            <button class="tx-action-btn tx-action-btn--delete" data-action="delete-acc" data-id="${a.id}" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="account-card__balance-label">Current Balance</div>
        <div class="account-card__balance" style="color:${bal >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">
          ${formatCurrency(bal)}
        </div>
      </div>
    `;
  }).join('') + `
    <div class="card account-card account-card--add" id="addAccountCard">
      <span class="add-icon">+</span>
      <span>New Account</span>
    </div>
  `;

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
  const msg     = txCount
    ? `This account has ${txCount} transactions. Deleting it will not remove those transactions. Continue?`
    : 'Delete this account?';
  if (!confirm(msg)) return;
  await AccountStore.delete(id);
  showToast('Account deleted');
  await renderAccountsGrid();
}

function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function capitalize(str)   { return str ? str[0].toUpperCase() + str.slice(1) : ''; }

document.addEventListener('DOMContentLoaded', () => {
  initAccounts();

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
  });

  document.getElementById('closeAccountModal')?.addEventListener('click', () => document.getElementById('accountModal')?.classList.remove('open'));
  document.getElementById('cancelAccount')?.addEventListener('click',     () => document.getElementById('accountModal')?.classList.remove('open'));
});
