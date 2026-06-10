/* ============================================================
   dashboard.js — Dashboard page logic (async)
   ============================================================ */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let currentMonthView = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
let _dashboardReady = false;

function showSkeletons() {
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
}

function getWeeklyRollup(transactions, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const weeks = [
    { label: 'Week 1', start: 1,  end: 7,             income: 0, expense: 0 },
    { label: 'Week 2', start: 8,  end: 14,             income: 0, expense: 0 },
    { label: 'Week 3', start: 15, end: 21,             income: 0, expense: 0 },
    { label: 'Week 4', start: 22, end: daysInMonth,    income: 0, expense: 0 },
  ];
  transactions.forEach(t => {
    if (!t.date.startsWith(prefix)) return;
    const day = parseInt(t.date.slice(8));
    const wk  = weeks.find(w => day >= w.start && day <= w.end);
    if (!wk) return;
    if (t.type === 'income')  wk.income  += t.amount;
    if (t.type === 'expense') wk.expense += t.amount;
  });
  return weeks;
}

function getMonthTransactions(allTx, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return allTx.filter(t => t.date.startsWith(prefix));
}

async function initDashboard() {
  if (!_dashboardReady) showSkeletons();
  const [allTx, accounts] = await Promise.all([
    TransactionStore.getAll(),
    AccountStore.getAll(),
  ]);

  const now = new Date();
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-`;
  const monthTx = allTx.filter(t => t.date.startsWith(thisMonthPrefix));

  const totalBalance = await AccountStore.getTotalBalance();
  const monthTotals  = SummaryEngine.getTotals(monthTx);
  const net          = monthTotals.income - monthTotals.expense;

  const heroMonthEl = document.getElementById('heroMonthLabel');
  if (heroMonthEl) heroMonthEl.textContent = now.toLocaleString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();

  animateValue(document.getElementById('totalBalance'), totalBalance, formatCurrency);
  animateValue(document.getElementById('monthIncome'),  monthTotals.income,  formatCurrency);
  animateValue(document.getElementById('monthExpense'), monthTotals.expense, formatCurrency);
  animateValue(document.getElementById('monthNet'), Math.abs(net), v => (net >= 0 ? '+' : '-') + formatCurrency(v));
  _dashboardReady = true;
  const incomeCount  = monthTx.filter(t => t.type === 'income').length;
  const expenseCount = monthTx.filter(t => t.type === 'expense').length;
  setText('monthIncomeSub',  incomeCount  === 1 ? '1 transaction' : `${incomeCount} transactions`);
  setText('monthExpenseSub', expenseCount === 1 ? '1 transaction' : `${expenseCount} transactions`);

  const netEl = document.getElementById('monthNet');
  if (netEl) netEl.style.color = net >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  /* Year & 90-day change */
  const yearAgoStr   = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const ninetyAgoStr = new Date(Date.now() -  90 * 86400000).toISOString().slice(0, 10);
  const yearNet   = SummaryEngine.getTotals(allTx.filter(t => t.date >= yearAgoStr));
  const ninetyNet = SummaryEngine.getTotals(allTx.filter(t => t.date >= ninetyAgoStr));
  const yNet = yearNet.income   - yearNet.expense;
  const nNet = ninetyNet.income - ninetyNet.expense;
  setText('yearChange',      (yNet >= 0 ? '+' : '') + formatCurrency(yNet));
  setText('ninetyDayChange', (nNet >= 0 ? '+' : '') + formatCurrency(nNet));
  const ycEl  = document.getElementById('yearChange');
  const ndcEl = document.getElementById('ninetyDayChange');
  if (ycEl)  ycEl.style.color  = yNet >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
  if (ndcEl) ndcEl.style.color = nNet >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  /* Balance over time chart */
  const rangeVal = document.getElementById('balanceChartRange')?.value || 'all';
  let chartDays;
  if (rangeVal === 'all') {
    if (allTx.length > 0) {
      const firstDate = allTx.map(t => t.date).sort()[0];
      chartDays = Math.max(1, Math.ceil((Date.now() - new Date(firstDate).getTime()) / 86400000) + 1);
    } else {
      chartDays = 30;
    }
  } else {
    chartDays = parseInt(rangeVal);
  }
  const balancePoints = SummaryEngine.getBalanceOverTime(allTx, accounts, chartDays);
  const balanceEmpty    = document.getElementById('balanceChartEmpty');
  const balanceSkeleton = document.getElementById('balanceChartSkeleton');
  balanceSkeleton?.setAttribute('hidden', '');
  if (allTx.length > 0) {
    balanceEmpty?.setAttribute('hidden', '');
    Charts.drawLineChart('balanceCanvas', balancePoints);
  } else {
    balanceEmpty?.removeAttribute('hidden');
  }

  /* Monthly overview — daily bars for current month view */
  updateMonthNav();
  await renderMonthlyChart(allTx);

  await renderAccounts(accounts);
  renderRecentTransactions(allTx.slice(0, 5));
  await renderRecurringBanner();
}

function updateMonthNav() {
  const label = document.getElementById('monthNavLabel');
  if (label) label.textContent = `${MONTH_NAMES[currentMonthView.month - 1]} ${currentMonthView.year}`;
}

async function renderMonthlyChart(allTx) {
  const { year, month } = currentMonthView;
  const weekly = getWeeklyRollup(allTx, year, month);
  const monthlyEmpty    = document.getElementById('monthlyChartEmpty');
  const monthlySkeleton = document.getElementById('monthlyChartSkeleton');
  monthlySkeleton?.setAttribute('hidden', '');
  const hasData = weekly.some(w => w.income > 0 || w.expense > 0);
  if (hasData) {
    monthlyEmpty?.setAttribute('hidden', '');
    Charts.drawBarChart('monthlyCanvas', weekly);
  } else {
    monthlyEmpty?.removeAttribute('hidden');
  }

}

async function renderRecurringBanner() {
  const banner = document.getElementById('recurringBanner');
  if (!banner) return;

  const due = await RecurringStore.getDue();
  if (!due.length) { banner.style.display = 'none'; return; }

  const cats = await Promise.all(due.map(r => CategoryStore.getById(r.categoryId)));
  banner.style.display = '';

  const freqLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

  banner.innerHTML = `
    <div class="recurring-banner__header">
      <span class="recurring-banner__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      </span>
      <span class="recurring-banner__title">${due.length} recurring transaction${due.length !== 1 ? 's' : ''} due</span>
      <a href="pages/recurring.html" class="btn btn--ghost btn--sm" style="margin-left:auto;font-size:.75rem;">Manage</a>
    </div>
    <div class="recurring-banner__list">
      ${due.map((r, i) => `
        <div class="recurring-item" data-id="${r.id}">
          <div class="recurring-item__icon">${cats[i]?.icon || '📦'}</div>
          <div class="recurring-item__info">
            <div class="recurring-item__name">${r.note || cats[i]?.name || 'Transaction'}</div>
            <div class="recurring-item__meta">${freqLabel[r.frequency] || r.frequency} · due ${formatDate(r.nextDue)}</div>
          </div>
          <div class="recurring-item__amount tx-amount--${r.type}">${formatCurrency(r.amount)}</div>
          <div class="recurring-item__actions">
            <button class="btn btn--primary btn--sm recurring-log-btn" data-id="${r.id}">Log</button>
            <button class="btn btn--ghost btn--sm recurring-skip-btn" data-id="${r.id}" title="Skip this occurrence">Skip</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  banner.querySelectorAll('.recurring-log-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rule = due.find(r => r.id === btn.dataset.id);
      if (!rule) return;
      btn.textContent = '…'; btn.disabled = true;
      try {
        await TransactionStore.add({
          date:        new Date().toISOString().slice(0, 10),
          amount:      rule.amount,
          type:        rule.type,
          categoryId:  rule.categoryId,
          accountId:   rule.accountId,
          toAccountId: rule.toAccountId || null,
          note:        rule.note,
          tags:        [],
        });
        await RecurringStore.advanceNext(rule.id);
        showToast('Transaction logged', 'success');
        await initDashboard();
      } catch (err) {
        showToast(err.message || 'Failed to log transaction', 'error');
        btn.textContent = 'Log'; btn.disabled = false;
      }
    });
  });

  banner.querySelectorAll('.recurring-skip-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await RecurringStore.advanceNext(btn.dataset.id);
      renderRecurringBanner();
    });
  });
}

async function renderAccounts(accounts) {
  const assetEl = document.getElementById('assetList');
  const debtEl  = document.getElementById('debtList');
  if (!assetEl && !debtEl) return;

  if (!accounts.length) {
    if (assetEl) assetEl.innerHTML = `<div class="empty-state">No accounts. <a href="pages/accounts.html">Add one →</a></div>`;
    if (debtEl)  debtEl.innerHTML  = `<div class="empty-state">No debt accounts.</div>`;
    return;
  }

  const balances = await Promise.all(accounts.map(a => AccountStore.getBalance(a.id)));
  const withBal  = accounts.map((a, i) => ({ ...a, bal: balances[i] }));

  const debtTypes = new Set(['credit']);
  const assets    = withBal.filter(a => !debtTypes.has(a.type));
  const debts     = withBal.filter(a =>  debtTypes.has(a.type));

  const TYPE_LABEL = { bank: 'Bank', cash: 'Cash', savings: 'Savings', investment: 'Investment', credit: 'Credit', other: 'Other' };

  function renderGroups(accs, isDebt) {
    if (!accs.length) return `<div class="empty-state">${isDebt ? 'No debt accounts.' : 'No asset accounts.'}</div>`;
    const byType = {};
    accs.forEach(a => { (byType[a.type] = byType[a.type] || []).push(a); });
    const color = isDebt ? 'var(--color-expense)' : 'var(--color-income)';
    const pillClass = isDebt ? 'acc-group-pill--debt' : 'acc-group-pill--asset';

    return Object.entries(byType).map(([type, list]) => {
      const groupTotal = list.reduce((s, a) => s + Math.abs(a.bal), 0);
      return `
        <div class="acc-group">
          <div class="acc-group-header">
            <span class="acc-group-pill ${pillClass}">${TYPE_LABEL[type] || type}</span>
            <span class="acc-group-total" style="color:${color}">${formatCurrency(groupTotal)}</span>
          </div>
          ${list.map(a => `
            <div class="acc-group-item">
              <div class="acc-group-name">${a.name}</div>
              <div class="acc-group-actions-row">
                <a href="pages/accounts.html" class="link--sm">Details</a>
                <a href="pages/add-transaction.html" class="link--sm">Add</a>
              </div>
              <div class="acc-group-balance" style="color:${a.bal < 0 ? 'var(--color-expense)' : color}">${formatCurrency(Math.abs(a.bal))}</div>
            </div>
          `).join('')}
        </div>`;
    }).join('');
  }

  if (assetEl) assetEl.innerHTML = renderGroups(assets, false);
  if (debtEl)  debtEl.innerHTML  = renderGroups(debts,  true);
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

  document.getElementById('monthNavPrev')?.addEventListener('click', async () => {
    currentMonthView.month--;
    if (currentMonthView.month < 1) { currentMonthView.month = 12; currentMonthView.year--; }
    updateMonthNav();
    const allTx = await TransactionStore.getAll();
    await renderMonthlyChart(allTx);
  });

  document.getElementById('monthNavNext')?.addEventListener('click', async () => {
    currentMonthView.month++;
    if (currentMonthView.month > 12) { currentMonthView.month = 1; currentMonthView.year++; }
    updateMonthNav();
    const allTx = await TransactionStore.getAll();
    await renderMonthlyChart(allTx);
  });
});
