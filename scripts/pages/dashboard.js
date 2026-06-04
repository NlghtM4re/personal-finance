/* ============================================================
   dashboard.js — Dashboard page logic (async)
   ============================================================ */

function showSkeletons() {
  const skeletonCard = `
    <div style="padding:4px 0">
      <div class="skeleton skeleton-title" style="width:60%"></div>
      <div class="skeleton skeleton-text"  style="width:40%"></div>
    </div>`;
  ['totalBalance','monthIncome','monthExpense','monthNet'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="skeleton skeleton-title" style="width:70%;display:inline-block;"></div>`;
  });
  const recentEl = document.getElementById('recentTransactions');
  if (recentEl) recentEl.innerHTML = [1,2,3].map(() => `
    <div class="tx-item">
      <div class="skeleton" style="width:40px;height:40px;border-radius:8px;flex-shrink:0;"></div>
      <div class="tx-info">
        <div class="skeleton skeleton-text" style="width:55%"></div>
        <div class="skeleton skeleton-text" style="width:35%"></div>
      </div>
      <div class="skeleton skeleton-text" style="width:60px"></div>
    </div>`).join('');
  const accEl = document.getElementById('accountList');
  if (accEl) accEl.innerHTML = [1,2].map(() => `
    <div class="account-item">
      <div class="skeleton" style="width:12px;height:12px;border-radius:50%;flex-shrink:0;"></div>
      <div class="account-info">
        <div class="skeleton skeleton-text" style="width:50%"></div>
        <div class="skeleton skeleton-text" style="width:30%"></div>
      </div>
      <div class="skeleton skeleton-text" style="width:70px"></div>
    </div>`).join('');
}

async function initDashboard() {
  showSkeletons();
  const [allTx, accounts, monthTx] = await Promise.all([
    TransactionStore.getAll(),
    AccountStore.getAll(),
    TransactionStore.thisMonth(),
  ]);

  const totalBalance = await AccountStore.getTotalBalance();
  const monthTotals  = SummaryEngine.getTotals(monthTx);
  const net          = monthTotals.income - monthTotals.expense;

  setText('totalBalance', formatCurrency(totalBalance));
  setText('monthIncome',  formatCurrency(monthTotals.income));
  setText('monthExpense', formatCurrency(monthTotals.expense));
  setText('monthNet',     (net >= 0 ? '+' : '') + formatCurrency(net));
  setText('monthIncomeSub',  `${monthTx.filter(t => t.type === 'income').length} transactions`);
  setText('monthExpenseSub', `${monthTx.filter(t => t.type === 'expense').length} transactions`);
  setText('monthNetSub',     net >= 0 ? 'Saved so far' : 'Over budget');

  const netEl = document.getElementById('monthNet');
  if (netEl) netEl.style.color = net >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  /* Balance over time chart */
  const days          = parseInt(document.getElementById('balanceChartRange')?.value || '30');
  const balancePoints = SummaryEngine.getBalanceOverTime(allTx, accounts, days);
  const balanceEmpty  = document.getElementById('balanceChartEmpty');
  if (allTx.length > 0) {
    balanceEmpty?.setAttribute('hidden', '');
    Charts.drawLineChart('balanceCanvas', balancePoints);
  } else {
    balanceEmpty?.removeAttribute('hidden');
  }

  /* Category donut */
  const byCategory = SummaryEngine.getByCategory(monthTx);
  const catEmpty   = document.getElementById('categoryChartEmpty');
  const legendEl   = document.getElementById('categoryLegend');
  if (byCategory.length > 0) {
    catEmpty?.setAttribute('hidden', '');
    const catNames = await Promise.all(
      byCategory.slice(0, 8).map(b => CategoryStore.getById(b.categoryId))
    );
    const slices = byCategory.slice(0, 8).map((b, i) => ({
      label: catNames[i]?.name || 'Other',
      value: b.total,
    }));
    Charts.drawDonutChart('categoryCanvas', slices);
    if (legendEl) {
      legendEl.innerHTML = slices.map((sl, i) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${Charts.COLORS[i % Charts.COLORS.length]}"></span>
          <span class="legend-label">${sl.label}</span>
          <span class="legend-amount">${formatCurrency(sl.value)}</span>
        </div>
      `).join('');
    }
  } else {
    catEmpty?.removeAttribute('hidden');
    if (legendEl) legendEl.innerHTML = '';
  }

  /* Monthly bar chart */
  const year         = parseInt(document.getElementById('monthlyYear')?.value || new Date().getFullYear());
  const monthly      = SummaryEngine.getMonthlyRollup(allTx, year);
  const monthlyEmpty = document.getElementById('monthlyChartEmpty');
  if (monthly.some(m => m.income > 0 || m.expense > 0)) {
    monthlyEmpty?.setAttribute('hidden', '');
    Charts.drawBarChart('monthlyCanvas', monthly);
  } else {
    monthlyEmpty?.removeAttribute('hidden');
  }

  renderAccounts(accounts);
  renderRecentTransactions(allTx.slice(0, 5));
}

async function renderAccounts(accounts) {
  const el = document.getElementById('accountList');
  if (!el) return;
  if (!accounts.length) {
    el.innerHTML = `<div class="empty-state">No accounts. <a href="pages/accounts.html">Add one →</a></div>`;
    return;
  }
  const balances = await Promise.all(accounts.map(a => AccountStore.getBalance(a.id)));
  el.innerHTML = accounts.map((a, i) => `
    <div class="account-item">
      <span class="account-dot" style="background:${a.color}"></span>
      <div class="account-info">
        <div class="account-name">${a.name}</div>
        <div class="account-type">${capitalize(a.type)}</div>
      </div>
      <div class="account-balance" style="color:${balances[i] >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">
        ${formatCurrency(balances[i])}
      </div>
    </div>
  `).join('');
}

async function renderRecentTransactions(txs) {
  const el = document.getElementById('recentTransactions');
  if (!el) return;
  if (!txs.length) {
    el.innerHTML = `<div class="empty-state">No transactions yet. <a href="pages/add-transaction.html">Add one →</a></div>`;
    return;
  }
  const cats = await Promise.all(txs.map(t => CategoryStore.getById(t.categoryId)));
  el.innerHTML = txs.map((t, i) => txItemHTML(t, cats[i])).join('');
}

function txItemHTML(t, cat) {
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '↔';
  return `
    <div class="tx-item">
      <div class="tx-icon tx-icon--${t.type}">${cat?.icon || '📦'}</div>
      <div class="tx-info">
        <div class="tx-name">${t.note || cat?.name || 'Transaction'}</div>
        <div class="tx-meta">${formatDate(t.date)} · ${cat?.name || '—'}</div>
      </div>
      <div class="tx-amount tx-amount--${t.type}">${sign}${formatCurrency(t.amount)}</div>
    </div>
  `;
}

function capitalize(str) { return str ? str[0].toUpperCase() + str.slice(1) : ''; }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  try {
    await initDashboard();
  } catch (err) {
    console.error('Dashboard error:', err);
    showToast('Error loading data: ' + err.message, 'error');
    ['totalBalance','monthIncome','monthExpense','monthNet'].forEach(id => setText(id, '—'));
  }
  document.getElementById('balanceChartRange')?.addEventListener('change', () => initDashboard().catch(console.error));
  document.getElementById('monthlyYear')?.addEventListener('change', () => initDashboard().catch(console.error));
});
