/* ============================================================
   transactions.js — Transaction list page (async)
   ============================================================ */

let currentFilters  = { search: '', categoryId: '', accountId: '', type: '', from: '', to: '' };
let displayedCount  = 20;
const PAGE_SIZE     = 20;

async function initTransactions() {
  await populateFilters();
  await Promise.all([renderTransactions(), renderStats()]);
}

async function populateFilters() {
  const [cats, accounts] = await Promise.all([CategoryStore.getAll(), AccountStore.getAll()]);
  const catSel = document.getElementById('filterCategory');
  const accSel = document.getElementById('filterAccount');
  if (catSel) catSel.innerHTML = `<option value="">All Categories</option>` +
    cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  if (accSel) accSel.innerHTML = `<option value="">All Accounts</option>` +
    accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

async function renderStats() {
  const txs    = await TransactionStore.query(currentFilters);
  const totals = SummaryEngine.getTotals(txs);
  const net    = totals.income - totals.expense;
  setText('statCount',   `${txs.length} transaction${txs.length !== 1 ? 's' : ''}`);
  setText('statIncome',  '↑ ' + formatCurrency(totals.income));
  setText('statExpense', '↓ ' + formatCurrency(totals.expense));
  setText('statNet',     (net >= 0 ? '+' : '') + formatCurrency(net));
  if (typeof updateFilterBadge === 'function') updateFilterBadge(currentFilters);
}

async function renderTransactions() {
  const el = document.getElementById('txListFull');
  if (!el) return;

  /* Show skeleton while fetching */
  el.innerHTML = [1,2,3,4,5].map(() => `
    <div class="tx-item">
      <div class="skeleton" style="width:40px;height:40px;border-radius:8px;flex-shrink:0;"></div>
      <div class="tx-info">
        <div class="skeleton skeleton-text" style="width:50%"></div>
        <div class="skeleton skeleton-text" style="width:30%"></div>
      </div>
      <div class="skeleton skeleton-text" style="width:65px"></div>
    </div>`).join('');

  const all   = await TransactionStore.query(currentFilters);
  const page  = all.slice(0, displayedCount);

  if (!all.length) {
    el.innerHTML = `<div class="empty-state">No transactions found.</div>`;
    renderLoadMore(0);
    return;
  }

  /* Fetch all categories needed */
  const catIds  = [...new Set(page.map(t => t.categoryId).filter(Boolean))];
  const accIds  = [...new Set(page.map(t => t.accountId).filter(Boolean))];
  const [cats, accounts] = await Promise.all([CategoryStore.getAll(), AccountStore.getAll()]);
  const catMap  = Object.fromEntries(cats.map(c => [c.id, c]));
  const accMap  = Object.fromEntries(accounts.map(a => [a.id, a]));

  /* Group by date */
  const grouped = {};
  page.forEach(t => {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  });

  el.innerHTML = Object.entries(grouped).map(([date, txs]) => `
    <div class="tx-date-group">${formatDate(date)}</div>
    ${txs.map(t => txItemFullHTML(t, catMap[t.categoryId], accMap[t.accountId])).join('')}
  `).join('');

  renderLoadMore(all.length);
  attachTxEvents();
}

function txItemFullHTML(t, cat, acc) {
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '↔';
  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon tx-icon--${t.type}">${cat?.icon || '📦'}</div>
      <div class="tx-info">
        <div class="tx-name">${t.note || cat?.name || 'Transaction'}</div>
        <div class="tx-meta">${cat?.name || '—'} · ${acc?.name || '—'}</div>
      </div>
      <div class="tx-amount tx-amount--${t.type}">${sign}${formatCurrency(t.amount)}</div>
      <div class="tx-actions">
        <button class="tx-action-btn" data-action="edit" data-id="${t.id}" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="tx-action-btn tx-action-btn--delete" data-action="delete" data-id="${t.id}" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div>
    </div>
  `;
}

function renderLoadMore(total) {
  const el = document.getElementById('pagination');
  if (!el) return;
  if (displayedCount >= total) { el.innerHTML = ''; return; }
  const remaining = total - displayedCount;
  el.innerHTML = `
    <button class="btn btn--ghost load-more-btn" id="loadMoreBtn">
      Load ${Math.min(PAGE_SIZE, remaining)} more
      <span class="load-more-count">${remaining} remaining</span>
    </button>
  `;
  document.getElementById('loadMoreBtn')?.addEventListener('click', async () => {
    displayedCount += PAGE_SIZE;
    await renderTransactions();
  });
}

function attachTxEvents() {
  document.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); window.location.href = `add-transaction.html?id=${btn.dataset.id}`; });
  });
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openDeleteModal(btn.dataset.id); });
  });
  /* Click anywhere on the row to edit */
  document.querySelectorAll('.tx-list-full .tx-item[data-id]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.tx-actions')) return;
      window.location.href = `add-transaction.html?id=${item.dataset.id}`;
    });
  });
}

function openDeleteModal(id) {
  const modal      = document.getElementById('deleteModal');
  const confirmBtn = document.getElementById('confirmDelete');
  if (!modal || !confirmBtn) return;
  modal.classList.add('open');
  confirmBtn.onclick = async () => {
    await TransactionStore.delete(id);
    modal.classList.remove('open');
    await Promise.all([renderTransactions(), renderStats()]);
    showToast('Transaction deleted', 'success');
  };
}

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  try {
    await initTransactions();
  } catch (err) {
    console.error('Transactions error:', err);
    document.getElementById('txListFull').innerHTML = `<div class="empty-state" style="color:var(--color-expense)">Error: ${err.message}</div>`;
  }

  document.getElementById('searchInput')?.addEventListener('input', e => {
    currentFilters.search = e.target.value; displayedCount = PAGE_SIZE;
    renderTransactions(); renderStats();
  });

  ['filterCategory','filterAccount','filterType'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
      const key = id === 'filterCategory' ? 'categoryId' : id === 'filterAccount' ? 'accountId' : 'type';
      currentFilters[key] = e.target.value; displayedCount = PAGE_SIZE;
      renderTransactions(); renderStats();
    });
  });

  document.getElementById('filterFrom')?.addEventListener('change', e => { currentFilters.from = e.target.value; displayedCount = PAGE_SIZE; renderTransactions(); renderStats(); });
  document.getElementById('filterTo')?.addEventListener('change',   e => { currentFilters.to   = e.target.value; displayedCount = PAGE_SIZE; renderTransactions(); renderStats(); });

  document.getElementById('clearFilters')?.addEventListener('click', () => {
    currentFilters = { search: '', categoryId: '', accountId: '', type: '', from: '', to: '' };
    displayedCount = PAGE_SIZE;
    document.querySelectorAll('.filter-bar select, .filter-bar input[type="date"]').forEach(el => el.value = '');
    document.getElementById('searchInput').value = '';
    renderTransactions(); renderStats();
  });

  document.getElementById('closeDeleteModal')?.addEventListener('click', () => document.getElementById('deleteModal')?.classList.remove('open'));
  document.getElementById('cancelDelete')?.addEventListener('click',     () => document.getElementById('deleteModal')?.classList.remove('open'));
});
