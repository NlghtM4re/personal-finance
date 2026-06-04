/* ============================================================
   dashboard.js — Dashboard page logic
   ============================================================ */

function initDashboard() {
  const allTx     = TransactionStore.getAll();
  const accounts  = AccountStore.getAll();
  const monthTx   = TransactionStore.thisMonth();
  const { from: mFrom, to: mTo } = currentMonthRange();

  /* --- Summary cards --- */
  const totalBalance  = AccountStore.getTotalBalance();
  const monthTotals   = SummaryEngine.getTotals(monthTx);
  const net           = monthTotals.income - monthTotals.expense;

  setText('totalBalance', formatCurrency(totalBalance));
  setText('monthIncome',  formatCurrency(monthTotals.income));
  setText('monthExpense', formatCurrency(monthTotals.expense));
  setText('monthNet',     (net >= 0 ? '+' : '') + formatCurrency(net));
  setText('monthIncomeSub',  `${monthTx.filter(t => t.type === 'income').length} transactions`);
  setText('monthExpenseSub', `${monthTx.filter(t => t.type === 'expense').length} transactions`);
  setText('monthNetSub',     net >= 0 ? 'Saved so far' : 'Over budget');

  const netEl = document.getElementById('monthNet');
  if (netEl) netEl.style.color = net >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  /* --- Balance over time chart --- */
  const balanceDays  = parseInt(document.getElementById('balanceChartRange')?.value || '30');
  const balancePoints = SummaryEngine.getBalanceOverTime(allTx, accounts, balanceDays);
  const balanceEmpty  = document.getElementById('balanceChartEmpty');
  if (balancePoints.length > 0 && allTx.length > 0) {
    balanceEmpty?.setAttribute('hidden', '');
    Charts.drawLineChart('balanceCanvas', balancePoints);
  } else {
    balanceEmpty?.removeAttribute('hidden');
  }

  /* --- Category donut chart --- */
  const byCategory   = SummaryEngine.getByCategory(monthTx);
  const catEmpty     = document.getElementById('categoryChartEmpty');
  const legendEl     = document.getElementById('categoryLegend');
  if (byCategory.length > 0) {
    catEmpty?.setAttribute('hidden', '');
    const slices = byCategory.slice(0, 8).map(b => ({
      label: CategoryStore.getById(b.categoryId)?.name || 'Other',
      value: b.total,
    }));
    Charts.drawDonutChart('categoryCanvas', slices);

    /* Legend */
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

  /* --- Monthly bar chart --- */
  const year        = parseInt(document.getElementById('monthlyYear')?.value || new Date().getFullYear());
  const monthly     = SummaryEngine.getMonthlyRollup(allTx, year);
  const monthlyEmpty = document.getElementById('monthlyChartEmpty');
  const hasMonthly   = monthly.some(m => m.income > 0 || m.expense > 0);
  if (hasMonthly) {
    monthlyEmpty?.setAttribute('hidden', '');
    Charts.drawBarChart('monthlyCanvas', monthly);
  } else {
    monthlyEmpty?.removeAttribute('hidden');
  }

  /* --- Account list --- */
  renderAccounts(accounts);

  /* --- Recent transactions (last 5) --- */
  renderRecentTransactions(allTx.slice(0, 5));
}

function renderAccounts(accounts) {
  const el = document.getElementById('accountList');
  if (!el) return;
  if (!accounts.length) {
    el.innerHTML = `<div class="empty-state">No accounts. <a href="pages/accounts.html">Add one →</a></div>`;
    return;
  }
  el.innerHTML = accounts.map(a => {
    const bal = AccountStore.getBalance(a.id);
    return `
      <div class="account-item">
        <span class="account-dot" style="background:${a.color}"></span>
        <div class="account-info">
          <div class="account-name">${a.name}</div>
          <div class="account-type">${capitalize(a.type)}</div>
        </div>
        <div class="account-balance" style="color:${bal >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">
          ${formatCurrency(bal)}
        </div>
      </div>
    `;
  }).join('');
}

function renderRecentTransactions(txs) {
  const el = document.getElementById('recentTransactions');
  if (!el) return;
  if (!txs.length) {
    el.innerHTML = `<div class="empty-state">No transactions yet. <a href="pages/add-transaction.html">Add one →</a></div>`;
    return;
  }
  el.innerHTML = txs.map(t => txItemHTML(t)).join('');
}

function txItemHTML(t) {
  const cat   = CategoryStore.getById(t.categoryId);
  const sign  = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '↔';
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

function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : '';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* --- Event listeners --- */
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();

  document.getElementById('balanceChartRange')?.addEventListener('change', initDashboard);
  document.getElementById('monthlyYear')?.addEventListener('change', initDashboard);
});
