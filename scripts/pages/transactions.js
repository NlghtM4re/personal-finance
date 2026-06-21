/* ============================================================
   transactions.js — Transaction list (the "Transactions" page,
   served from accounts.html alongside the Accounts panel).
   Search · type tabs · category/account filters · date-range
   presets · sort · CSV export of the filtered view. The list is
   grouped by day with a per-day net subtotal. Account add/edit
   lives in accounts.js; this file owns everything transaction.
   ============================================================ */

let currentFilters = { search: '', categoryId: '', accountId: '', type: '', from: '', to: '' };
let currentSort    = 'date-desc';
let currentRange   = 'all';
let displayedCount = 20;
const PAGE_SIZE    = 20;

let _catMap = {};
let _accMap = {};

async function initTransactions() {
  await populateFilters();
  await Promise.all([renderTransactions(), renderStats()]);
}

async function populateFilters() {
  const [cats, accounts] = await Promise.all([CategoryStore.getAll(), AccountStore.getAll()]);
  _catMap = Object.fromEntries(cats.map(c => [c.id, c]));
  _accMap = Object.fromEntries(accounts.map(a => [a.id, a]));
  const catSel = document.getElementById('filterCategory');
  const accSel = document.getElementById('filterAccount');
  if (catSel) catSel.innerHTML = `<option value="">All categories</option>` +
    cats.map(c => `<option value="${c.id}">${c.icon} ${escapeHTML(c.name)}</option>`).join('');
  if (accSel) accSel.innerHTML = `<option value="">All accounts</option>` +
    accounts.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('');
}

/* ---- query + client-side sort ---- */
function sortTxs(txs) {
  const by = {
    'date-desc':   (a, b) => (b.date.localeCompare(a.date)) || ((b.createdAt || '').localeCompare(a.createdAt || '')),
    'date-asc':    (a, b) => (a.date.localeCompare(b.date)) || ((a.createdAt || '').localeCompare(b.createdAt || '')),
    'amount-desc': (a, b) => b.amount - a.amount,
    'amount-asc':  (a, b) => a.amount - b.amount,
  }[currentSort] || ((a, b) => b.date.localeCompare(a.date));
  return txs.slice().sort(by);
}

async function getFiltered() {
  return sortTxs(await TransactionStore.query(currentFilters));
}

/* ---- stats (reflect the active filters) ---- */
async function renderStats() {
  const txs    = await TransactionStore.query(currentFilters);
  const totals = SummaryEngine.getTotals(txs);
  const net    = totals.income - totals.expense;
  setText('statIncome',  formatCurrency(totals.income));
  setText('statExpense', formatCurrency(totals.expense));
  setText('statNet',     (net >= 0 ? '+' : '−') + formatCurrency(Math.abs(net)));
  setText('statCount',   String(txs.length));
  const netEl = document.getElementById('statNet');
  if (netEl) netEl.style.color = net >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  const anyFilter = currentFilters.search || currentFilters.categoryId || currentFilters.accountId ||
                    currentFilters.type || currentFilters.from || currentFilters.to;
  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.hidden = !anyFilter;
  if (typeof updateFilterBadge === 'function') updateFilterBadge(currentFilters);
}

/* ---- list ---- */
function txSkeleton() {
  return [1,2,3,4,5].map(() => `
    <div class="tx-item">
      <div class="skeleton" style="width:40px;height:40px;border-radius:8px;flex-shrink:0;"></div>
      <div class="tx-info">
        <div class="skeleton skeleton-text" style="width:50%"></div>
        <div class="skeleton skeleton-text" style="width:30%"></div>
      </div>
      <div class="skeleton skeleton-text" style="width:65px"></div>
    </div>`).join('');
}

async function renderTransactions() {
  const el = document.getElementById('txListFull');
  if (!el) return;
  el.innerHTML = txSkeleton();

  const all  = await getFiltered();
  const page = all.slice(0, displayedCount);

  if (!all.length) {
    const filtered = currentFilters.search || currentFilters.categoryId || currentFilters.accountId ||
                     currentFilters.type || currentFilters.from || currentFilters.to;
    el.innerHTML = `<div class="empty-state" style="padding:48px 24px;text-align:center;">
        <div style="font-weight:600;color:var(--color-text);margin-bottom:6px;">${filtered ? 'No matches' : 'No transactions yet'}</div>
        <div style="font-size:.8125rem;">${filtered
          ? 'Try clearing or widening your filters.'
          : '<a href="add-transaction.html" style="color:var(--color-text)">Add your first transaction →</a>'}</div>
      </div>`;
    renderLoadMore(0);
    return;
  }

  if (currentSort.startsWith('date')) {
    /* group by date, with a per-day net subtotal */
    const grouped = {};
    page.forEach(t => { (grouped[t.date] = grouped[t.date] || []).push(t); });
    const orderedDates = Object.keys(grouped).sort((a, b) =>
      currentSort === 'date-asc' ? a.localeCompare(b) : b.localeCompare(a));
    el.innerHTML = orderedDates.map(date => {
      const txs = grouped[date];
      const dayNet = txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
      /* only worth a day-total when more than one transaction shares the day */
      const netStr = (txs.length < 2 || Math.abs(dayNet) < 0.005) ? '' :
        `<span class="tx-date-group__net" style="color:${dayNet >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">${dayNet >= 0 ? '+' : '−'}${formatCurrency(Math.abs(dayNet))}</span>`;
      return `<div class="tx-date-group"><span>${formatDate(date)}</span>${netStr}</div>
        ${txs.map(t => txItemFullHTML(t, _catMap[t.categoryId], _accMap[t.accountId])).join('')}`;
    }).join('');
  } else {
    /* amount sort: a flat list (date shown per-row, since grouping by day
       would re-impose date order and defeat the sort) */
    el.innerHTML = page.map(t => txItemFullHTML(t, _catMap[t.categoryId], _accMap[t.accountId], true)).join('');
  }

  renderLoadMore(all.length);
  attachTxEvents();
}

function txItemFullHTML(t, cat, acc, showDate = false) {
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  let meta;
  if (t.type === 'transfer') {
    const to = _accMap[t.toAccountId];
    meta = `${escapeHTML(acc?.name) || '—'} <span class="tx-meta__arrow">→</span> ${escapeHTML(to?.name) || '—'}`;
  } else {
    meta = `${escapeHTML(cat?.name) || 'Uncategorized'} · ${escapeHTML(acc?.name) || 'No account'}`;
  }
  if (showDate) meta = `${formatDateShort(t.date)} · ${meta}`;
  const tag = (t.tags && t.tags.length) ? `<span class="tx-tag">${escapeHTML(t.tags[0])}</span>` : '';
  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon tx-icon--${t.type}">${categoryIconHTML(cat, 18)}</div>
      <div class="tx-info">
        <div class="tx-name">${escapeHTML(t.note) || escapeHTML(cat?.name) || (t.type === 'transfer' ? 'Transfer' : 'Transaction')}${tag}</div>
        <div class="tx-meta">${meta}</div>
      </div>
      <div class="tx-amount tx-amount--${t.type}">${sign}${formatCurrency(t.amount)}</div>
      <div class="tx-actions">
        <button class="tx-action-btn" data-action="edit" data-id="${t.id}" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="tx-action-btn tx-action-btn--delete" data-action="delete" data-id="${t.id}" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div>
    </div>`;
}

function renderLoadMore(total) {
  const el = document.getElementById('pagination');
  if (!el) return;
  const shown = Math.min(displayedCount, total);
  if (shown >= total) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn btn--ghost load-more-btn" id="loadMoreBtn">
      Load more
      <span class="load-more-count">${shown} of ${total} shown</span>
    </button>`;
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

/* ---- date-range presets ---- */
function applyRange(range) {
  currentRange = range;
  const customWrap = document.getElementById('txCustomDates');
  if (range === 'custom') { if (customWrap) customWrap.hidden = false; return; }
  if (customWrap) customWrap.hidden = true;
  const fromEl = document.getElementById('filterFrom');
  const toEl   = document.getElementById('filterTo');
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';

  if (range === 'all') { currentFilters.from = ''; currentFilters.to = ''; return; }
  const today = new Date();
  currentFilters.to = isoLocal(today);
  if (range === 'month') {
    currentFilters.from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  } else {
    const d = new Date(); d.setDate(d.getDate() - (parseInt(range) - 1));
    currentFilters.from = isoLocal(d);
  }
}

function refresh() { displayedCount = PAGE_SIZE; renderTransactions(); renderStats(); }

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  try {
    await initTransactions();
  } catch (err) {
    console.error('Transactions error:', err);
    showErrorState('txListFull', "Couldn't load transactions. " + (err.message || ''), () => location.reload());
  }

  /* search (debounced) */
  let _searchTimer;
  document.getElementById('searchInput')?.addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => { currentFilters.search = e.target.value; refresh(); }, 250);
  });

  /* type tabs */
  document.querySelectorAll('#txTypeTabs .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilters.type = btn.dataset.type;
      document.querySelectorAll('#txTypeTabs .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      refresh();
    });
  });

  /* category / account selects */
  document.getElementById('filterCategory')?.addEventListener('change', e => { currentFilters.categoryId = e.target.value; refresh(); });
  document.getElementById('filterAccount')?.addEventListener('change',  e => { currentFilters.accountId  = e.target.value; refresh(); });

  /* date-range preset + custom dates */
  document.getElementById('txRange')?.addEventListener('change', e => { applyRange(e.target.value); refresh(); });
  document.getElementById('filterFrom')?.addEventListener('change', e => { currentFilters.from = e.target.value; refresh(); });
  document.getElementById('filterTo')?.addEventListener('change',   e => { currentFilters.to   = e.target.value; refresh(); });

  /* sort */
  document.getElementById('txSort')?.addEventListener('change', e => { currentSort = e.target.value; refresh(); });

  /* export the current filtered view */
  document.getElementById('exportCsv')?.addEventListener('click', async () => {
    const btn = document.getElementById('exportCsv');
    btn.disabled = true;
    try {
      const txs = await getFiltered();
      if (!txs.length) { showToast('Nothing to export', 'error'); return; }
      await CSVService.export(txs);
      showToast(`Exported ${txs.length} transaction${txs.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally { btn.disabled = false; }
  });

  /* clear all filters */
  document.getElementById('clearFilters')?.addEventListener('click', () => {
    currentFilters = { search: '', categoryId: '', accountId: '', type: '', from: '', to: '' };
    currentRange = 'all';
    document.querySelectorAll('.tx-toolbar select, .tx-toolbar input[type="date"]').forEach(el => { el.value = el.id === 'txRange' ? 'all' : el.id === 'txSort' ? el.value : ''; });
    document.getElementById('txSort').value = currentSort;
    document.getElementById('txRange').value = 'all';
    document.getElementById('txCustomDates').hidden = true;
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('#txTypeTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === ''));
    refresh();
  });

  document.getElementById('closeDeleteModal')?.addEventListener('click', () => document.getElementById('deleteModal')?.classList.remove('open'));
  document.getElementById('cancelDelete')?.addEventListener('click',     () => document.getElementById('deleteModal')?.classList.remove('open'));
});
