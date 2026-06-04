/* ============================================================
   transactions.js — Transaction list page logic
   ============================================================ */

let currentFilters = { search: '', categoryId: '', accountId: '', type: '', from: '', to: '' };
let currentPage    = 1;
const PAGE_SIZE    = 20;

function initTransactions() {
  populateFilters();
  renderTransactions();
  renderStats();
}

function populateFilters() {
  const catSel = document.getElementById('filterCategory');
  const accSel = document.getElementById('filterAccount');
  if (catSel) {
    catSel.innerHTML = `<option value="">All Categories</option>` +
      CategoryStore.getAll().map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  }
  if (accSel) {
    accSel.innerHTML = `<option value="">All Accounts</option>` +
      AccountStore.getAll().map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  }
}

function renderStats() {
  const txs       = TransactionStore.query(currentFilters);
  const totals    = SummaryEngine.getTotals(txs);
  const net       = totals.income - totals.expense;
  setText('statCount',   `${txs.length} transactions`);
  setText('statIncome',  formatCurrency(totals.income));
  setText('statExpense', formatCurrency(totals.expense));
  setText('statNet',     (net >= 0 ? '+' : '') + formatCurrency(net));
}

function renderTransactions() {
  const el  = document.getElementById('txListFull');
  if (!el) return;

  const all   = TransactionStore.query(currentFilters);
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = all.slice(start, start + PAGE_SIZE);

  if (!all.length) {
    el.innerHTML = `<div class="empty-state">No transactions found.</div>`;
    renderPagination(0);
    return;
  }

  /* Group by date */
  const grouped = {};
  page.forEach(t => {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  });

  el.innerHTML = Object.entries(grouped).map(([date, txs]) => `
    <div class="tx-date-group">${formatDate(date)}</div>
    ${txs.map(t => txItemFullHTML(t)).join('')}
  `).join('');

  renderPagination(all.length);
  attachTxEvents();
}

function txItemFullHTML(t) {
  const cat  = CategoryStore.getById(t.categoryId);
  const acc  = AccountStore.getById(t.accountId);
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
        <button class="tx-action-btn" data-action="edit" data-id="${t.id}" title="Edit">✏️</button>
        <button class="tx-action-btn tx-action-btn--delete" data-action="delete" data-id="${t.id}" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

function renderPagination(total) {
  const el = document.getElementById('pagination');
  if (!el) return;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
  }
  html += `<button class="page-btn" ${currentPage === pages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
  el.innerHTML = html;

  el.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      renderTransactions();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function attachTxEvents() {
  document.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.location.href = `add-transaction.html?id=${btn.dataset.id}`;
    });
  });
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id);
    });
  });
}

/* Delete modal */
function openDeleteModal(id) {
  const modal  = document.getElementById('deleteModal');
  const confirmBtn = document.getElementById('confirmDelete');
  if (!modal || !confirmBtn) return;
  modal.classList.add('open');
  confirmBtn.onclick = () => {
    TransactionStore.delete(id);
    modal.classList.remove('open');
    currentPage = 1;
    renderTransactions();
    renderStats();
    showToast('Transaction deleted', 'success');
  };
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

document.addEventListener('DOMContentLoaded', () => {
  initTransactions();

  /* Search */
  document.getElementById('searchInput')?.addEventListener('input', e => {
    currentFilters.search = e.target.value;
    currentPage = 1;
    renderTransactions();
    renderStats();
  });

  /* Filter selects */
  ['filterCategory', 'filterAccount', 'filterType'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
      const key = id.replace('filter', '').toLowerCase();
      currentFilters[key === 'category' ? 'categoryId' : key === 'account' ? 'accountId' : 'type'] = e.target.value;
      currentPage = 1;
      renderTransactions();
      renderStats();
    });
  });

  /* Date range */
  document.getElementById('filterFrom')?.addEventListener('change', e => { currentFilters.from = e.target.value; currentPage = 1; renderTransactions(); renderStats(); });
  document.getElementById('filterTo')?.addEventListener('change', e => { currentFilters.to = e.target.value; currentPage = 1; renderTransactions(); renderStats(); });

  /* Clear filters */
  document.getElementById('clearFilters')?.addEventListener('click', () => {
    currentFilters = { search: '', categoryId: '', accountId: '', type: '', from: '', to: '' };
    currentPage    = 1;
    document.querySelectorAll('.filter-bar select, .filter-bar input').forEach(el => el.value = '');
    document.getElementById('searchInput').value = '';
    renderTransactions();
    renderStats();
  });

  /* Delete modal close */
  document.getElementById('closeDeleteModal')?.addEventListener('click', () => {
    document.getElementById('deleteModal')?.classList.remove('open');
  });
  document.getElementById('cancelDelete')?.addEventListener('click', () => {
    document.getElementById('deleteModal')?.classList.remove('open');
  });
});
