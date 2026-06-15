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

  const balanceMap   = SummaryEngine.computeAccountBalances(accounts, allTx);
  const totalBalance = Object.values(balanceMap).reduce((s, b) => s + b, 0);
  const monthTotals  = SummaryEngine.getTotals(monthTx);
  const net          = monthTotals.income - monthTotals.expense;

  const heroMonthEl = document.getElementById('heroMonthLabel');
  if (heroMonthEl) heroMonthEl.textContent = '· ' + now.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  /* cinematic count-up for the balance */
  animateValue(document.getElementById('totalBalance'), totalBalance, formatCurrency, 1400);
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

  /* Change pill next to the balance (wallet staple) */
  const pill = document.getElementById('balanceChangePill');
  if (pill) {
    const prev = totalBalance - net;
    if (!allTx.length || (Math.abs(prev) < 0.005 && Math.abs(net) < 0.005)) {
      pill.hidden = true;
    } else if (Math.abs(prev) > 0.005) {
      const pct  = (net / Math.abs(prev)) * 100;
      const up   = pct >= 0.05, down = pct <= -0.05;
      pill.className = 'flow-pill ' + (up ? 'flow-pill--up' : down ? 'flow-pill--down' : 'flow-pill--flat');
      pill.textContent = `${up ? '▲' : down ? '▼' : '·'} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% this month`;
      pill.hidden = false;
    } else {
      pill.className = 'flow-pill ' + (net >= 0 ? 'flow-pill--up' : 'flow-pill--down');
      pill.textContent = `${net >= 0 ? '▲ +' : '▼ −'}${formatCurrency(Math.abs(net))} this month`;
      pill.hidden = false;
    }
  }

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

  renderAccounts(accounts, balanceMap, allTx);
  renderAllocation(accounts, balanceMap);
  /* crypto folds into net worth (not the cash balance); non-blocking so a
     wallet/network hiccup never breaks the rest of the dashboard */
  renderCrypto(totalBalance).catch(console.error);
  await renderRecentTransactions(allTx.slice(0, 8));
  await renderRecurringBanner();
}

/* Crypto holdings — one panel per wallet; total counts toward net worth */
async function renderCrypto(bankBalance) {
  const section = document.getElementById('cryptoSection');
  const tilesEl = document.getElementById('cryptoTiles');
  const totalEl = document.getElementById('cryptoSectionTotal');
  const nwEl    = document.getElementById('cryptoNetWorth');
  if (!section || !tilesEl || typeof CryptoBalances === 'undefined') return;

  let snap;
  try { snap = await CryptoBalances.snapshot(); }
  catch { section.hidden = true; return; }

  if (!snap.wallets.length) { section.hidden = true; return; }
  section.hidden = false;

  totalEl.textContent = formatCurrency(snap.total) + (snap.anyMissing ? ' +' : '');
  tilesEl.innerHTML = snap.items.map(cryptoTileHTML).join('');

  if (nwEl) {
    const netWorth = bankBalance + snap.total;
    nwEl.innerHTML =
      `<span class="dash-crypto__nw-label">Net worth · cash + crypto</span>` +
      `<span class="dash-crypto__nw-val">${formatCurrency(netWorth)}</span>`;
  }
}

/* Crypto wallet tile — mirrors the account tile design (avatar + name +
   type, big value, sparkline + change foot), with a chain-colored coin
   badge. Shows the wallet's current fiat value and its coin amount. */
function cryptoTileHTML(r) {
  const w = r.wallet;
  const chain = CHAINS[w.chain] || { symbol: '?', label: w.chain, color: 'var(--color-text)' };
  const ok   = !r.error;
  const fiat = (ok && r.fiat != null) ? formatCurrency(r.fiat) : '—';
  const dec  = CHAINS[w.chain]?.decimals ?? 8;
  const sub  = ok
    ? `${r.amount != null ? r.amount.toFixed(dec).replace(/\.?0+$/, '') : '0'} ${chain.symbol}`
    : `<span style="color:var(--color-expense)">lookup failed</span>`;
  const spark = (ok && r.sparkline && r.sparkline.length > 1) ? sparklineSVG(r.sparkline) : '';
  return `
    <div class="acct-tile crypto-acct-tile" style="--chain:${chain.color};">
      <div class="acct-tile__row1">
        <div class="acct-tile__top">
          <span class="acct-tile__avatar">${chain.symbol}</span>
          <div class="acct-tile__id">
            <div class="acct-tile__name">${escapeHTML(w.label)}</div>
            <div class="acct-tile__type">${chain.label}</div>
          </div>
        </div>
        <div class="acct-tile__chart">${spark}</div>
      </div>
      <div class="acct-tile__row2">
        <div class="acct-tile__figures">
          <div class="acct-tile__bal font-display">${fiat}</div>
          <div class="acct-tile__sub">${sub}</div>
        </div>
        ${ok ? cryptoDeltaHTML(r.change24h) : ''}
      </div>
    </div>`;
}

function cryptoDeltaHTML(change24h) {
  if (change24h == null) return `<span class="delta delta--flat">· 24h</span>`;
  const cls = change24h >= 0 ? 'up' : 'down';
  return `<span class="delta delta--${cls}">${change24h >= 0 ? '▲ +' : '▼ −'}${Math.abs(change24h).toFixed(1)}% · 24h</span>`;
}

function updateMonthNav() {
  const label = document.getElementById('monthNavLabel');
  if (label) label.textContent = `${MONTH_NAMES[currentMonthView.month - 1]} ${currentMonthView.year}`;
}

async function renderMonthlyChart(allTx) {
  const { year, month } = currentMonthView;
  const weekly = getWeeklyRollup(allTx, year, month);
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() + 1) {
    const day = now.getDate();
    weekly.forEach(w => { w.highlight = day >= w.start && day <= w.end; });
  }
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
            <div class="recurring-item__name">${escapeHTML(r.note) || cats[i]?.name || 'Transaction'}</div>
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

/* Per-account daily balance history (last `days` days, oldest first).
   Walks backwards from the current balance using transaction effects. */
function accountHistory(allTx, accountId, currentBal, days = 30) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const dateAt = i => new Date(today.getTime() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
  const startStr = dateAt(0);

  const delta = {};
  allTx.forEach(t => {
    if (t.date < startStr) return;
    let eff = 0;
    if (t.type === 'income'  && t.accountId === accountId) eff += t.amount;
    if (t.type === 'expense' && t.accountId === accountId) eff -= t.amount;
    if (t.type === 'transfer') {
      if (t.accountId === accountId)   eff -= t.amount;
      if (t.toAccountId === accountId) eff += t.amount;
    }
    if (eff !== 0) delta[t.date] = (delta[t.date] || 0) + eff;
  });

  const out = new Array(days);
  let bal = currentBal;
  for (let i = days - 1; i >= 0; i--) {
    out[i] = bal;
    bal -= (delta[dateAt(i)] || 0);
  }
  return out;
}

/* Responsive sparkline — stretches to its container (preserveAspectRatio
   none) with a non-scaling stroke so the line stays crisp at any size. */
function sparklineSVG(values, w = 120, h = 48) {
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`
  ).join(' ');
  const first = values[0], last = values[values.length - 1];
  const color = Math.abs(last - first) < 0.005
    ? 'var(--color-text-muted)'
    : (last >= first ? 'var(--color-income)' : 'var(--color-expense)');
  return `<svg class="spark" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function deltaHTML(bal, base) {
  const diff = bal - base;
  if (Math.abs(diff) < 0.005) {
    return `<span class="delta delta--flat">· 30d</span>`;
  }
  if (Math.abs(base) > 0.005) {
    const pct = (diff / Math.abs(base)) * 100;
    const cls = pct >= 0 ? 'up' : 'down';
    return `<span class="delta delta--${cls}">${pct >= 0 ? '▲ +' : '▼ '}${pct.toFixed(1)}%</span>`;
  }
  const cls = diff >= 0 ? 'up' : 'down';
  return `<span class="delta delta--${cls}">${diff >= 0 ? '▲ +' : '▼ −'}${formatCurrency(Math.abs(diff))}</span>`;
}

/* Wallet-style account tiles */
function renderAccounts(accounts, balanceMap, allTx) {
  const el = document.getElementById('accountTiles');
  if (!el) return;

  if (!accounts.length) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No accounts yet. <a href="pages/accounts.html">Add one →</a></div>`;
    return;
  }

  const TYPE_LABEL = { bank: 'Bank', cash: 'Cash', savings: 'Savings', investment: 'Investment', credit: 'Credit', other: 'Other' };

  /* largest balance first */
  const sorted = [...accounts].sort((a, b) => (balanceMap[b.id] ?? 0) - (balanceMap[a.id] ?? 0));

  el.innerHTML = sorted.map((a) => {
    const bal  = balanceMap[a.id] ?? 0;
    const hist = accountHistory(allTx, a.id, bal, 30);
    return `
      <div class="acct-tile">
        <div class="acct-tile__row1">
          <div class="acct-tile__top">
            <span class="acct-tile__avatar">${escapeHTML((a.name || '?').charAt(0).toUpperCase())}</span>
            <div class="acct-tile__id">
              <div class="acct-tile__name">${escapeHTML(a.name)}</div>
              <div class="acct-tile__type">${TYPE_LABEL[a.type] || a.type}</div>
            </div>
          </div>
          <div class="acct-tile__chart">${sparklineSVG(hist)}</div>
        </div>
        <div class="acct-tile__row2">
          <div class="acct-tile__figures">
            <div class="acct-tile__bal font-display" style="${bal < 0 ? 'color:var(--color-expense)' : ''}">${formatCurrency(bal)}</div>
          </div>
          ${deltaHTML(bal, hist[0])}
        </div>
      </div>`;
  }).join('');
}

/* Allocation — share of total positive balances, mono ring per account */
function ringSVG(pct, color, size = 26) {
  const r = 10, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  return `<svg class="alloc-row__ring" width="${size}" height="${size}" viewBox="0 0 26 26" aria-hidden="true">
    <circle cx="13" cy="13" r="${r}" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="3"/>
    <circle cx="13" cy="13" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 13 13)"/>
  </svg>`;
}

function renderAllocation(accounts, balanceMap) {
  const el = document.getElementById('allocationList');
  if (!el) return;

  const pos = accounts
    .map(a => ({ a, bal: Math.max(0, balanceMap[a.id] ?? 0) }))
    .filter(x => x.bal > 0)
    .sort((x, y) => y.bal - x.bal);
  const total = pos.reduce((s, x) => s + x.bal, 0);

  if (!total) {
    el.innerHTML = `<div class="empty-state">No balances yet.</div>`;
    return;
  }

  const SHADES = ['#ffffff', '#9a9aa4', '#62626c', '#46464e', '#34343c'];
  const top = pos.slice(0, 4);
  const rest = pos.slice(4);
  const rows = top.map((x, i) => ({ name: x.a.name, bal: x.bal, color: SHADES[i] }));
  if (rest.length) rows.push({ name: `Other (${rest.length})`, bal: rest.reduce((s, x) => s + x.bal, 0), color: SHADES[4] });

  el.innerHTML = rows.map(r => {
    const pct = (r.bal / total) * 100;
    return `
      <div class="alloc-row">
        ${ringSVG(pct, r.color)}
        <span class="alloc-row__pct">${pct.toFixed(0)}%</span>
        <span class="alloc-row__name">${escapeHTML(r.name)}</span>
        <span class="alloc-row__amt">${formatCurrency(r.bal)}</span>
      </div>`;
  }).join('');
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
        <div class="tx-name">${escapeHTML(t.note) || cat?.name || 'Transaction'}</div>
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
