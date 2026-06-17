/* ============================================================
   summary.js — Pure calculation functions (no side effects)
   ============================================================ */

const SummaryEngine = {

  /* Total income, expense, net for a list of transactions */
  getTotals(transactions) {
    return transactions.reduce((acc, t) => {
      if (t.type === 'income')  acc.income  += t.amount;
      if (t.type === 'expense') acc.expense += t.amount;
      return acc;
    }, { income: 0, expense: 0, net: 0, count: transactions.length });
  },

  /* Finalize net after reducing */
  finalizeTotals(acc) {
    return { ...acc, net: acc.income - acc.expense };
  },

  /* Pick two distinct net-change windows for the dashboard stat cells.
     `spanDays` is the account age (days since the first transaction).
     The long window is "1 year" once there's a year of history, else
     "All time" (the full span); the short window is the largest of
     90/30/7 days that is strictly shorter than the long one (or half the
     span on a very young account). This guarantees the two cells show
     distinct periods instead of identical values on a young account.
     Returns { shortW, longW }, each { days, label }. */
  pickChangeWindows(spanDays) {
    const span  = Math.max(1, spanDays || 0);
    const label = d => d >= 365 ? '1 year' : (d <= 1 ? '1 day' : `${d} days`);
    const longW = span >= 365
      ? { days: 365, label: '1 year' }
      : { days: span, label: 'All time' };
    let shortDays = [90, 30, 7].find(d => d < longW.days);
    if (!shortDays) shortDays = Math.max(1, Math.floor(longW.days / 2));
    return { shortW: { days: shortDays, label: label(shortDays) }, longW };
  },

  /* Per-account balances computed from one transaction list (avoids per-account queries) */
  computeAccountBalances(accounts, transactions) {
    const map = {};
    accounts.forEach(a => { map[a.id] = a.initialBalance; });
    transactions.forEach(t => {
      if (t.type === 'income'  && map[t.accountId] !== undefined) map[t.accountId] += t.amount;
      if (t.type === 'expense' && map[t.accountId] !== undefined) map[t.accountId] -= t.amount;
      if (t.type === 'transfer') {
        if (map[t.accountId]   !== undefined) map[t.accountId]   -= t.amount;
        if (map[t.toAccountId] !== undefined) map[t.toAccountId] += t.amount;
      }
    });
    return map;
  },

  /* Totals grouped by category for a given type (expense by default) */
  getByCategory(transactions, type = 'expense') {
    const map = {};
    transactions.forEach(t => {
      if (t.type !== type) return;
      if (!map[t.categoryId]) map[t.categoryId] = 0;
      map[t.categoryId] += t.amount;
    });
    return Object.entries(map)
      .map(([categoryId, total]) => ({ categoryId, total }))
      .sort((a, b) => b.total - a.total);
  },

  /* Monthly rollup for a given year */
  getMonthlyRollup(transactions, year) {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i,
      label: new Date(year, i, 1).toLocaleString('en-US', { month: 'short' }),
      income:  0,
      expense: 0,
      net:     0,
    }));
    transactions.forEach(t => {
      const d = new Date(t.date + 'T00:00:00');
      if (d.getFullYear() !== year) return;
      const m = months[d.getMonth()];
      if (t.type === 'income')  m.income  += t.amount;
      if (t.type === 'expense') m.expense += t.amount;
    });
    months.forEach(m => { m.net = m.income - m.expense; });
    return months;
  },

  /* Monthly net-worth snapshots going back N months */
  getNetWorthHistory(transactions, accounts, months = 12) {
    const today        = new Date();
    const totalInitial = accounts.reduce((s, a) => s + a.initialBalance, 0);
    const points       = [];
    for (let i = months - 1; i >= 0; i--) {
      const d          = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const cutoff     = endOfMonth > today ? today : endOfMonth;
      const cutoffStr  = cutoff.toISOString().slice(0, 10);
      const balance    = totalInitial + transactions
        .filter(t => t.date <= cutoffStr)
        .reduce((s, t) => {
          if (t.type === 'income')  return s + t.amount;
          if (t.type === 'expense') return s - t.amount;
          return s;
        }, 0);
      points.push({
        date:    cutoffStr,
        label:   d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        balance,
      });
    }
    return points;
  },

  /* Running balance over time for line chart */
  getBalanceOverTime(transactions, accounts, days = 30) {
    const today    = new Date();
    const startDay = new Date(today);
    startDay.setDate(today.getDate() - (days - 1));

    const totalInitial = accounts.reduce((s, a) => s + a.initialBalance, 0);

    /* balance before the window */
    const beforeWindow = transactions.filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return d < startDay;
    });
    let runningBalance = totalInitial + beforeWindow.reduce((s, t) => {
      if (t.type === 'income')  return s + t.amount;
      if (t.type === 'expense') return s - t.amount;
      return s;
    }, 0);

    /* daily delta map */
    const deltaMap = {};
    transactions.forEach(t => {
      const d = new Date(t.date + 'T00:00:00');
      if (d < startDay || d > today) return;
      const key = t.date;
      if (!deltaMap[key]) deltaMap[key] = 0;
      if (t.type === 'income')  deltaMap[key] += t.amount;
      if (t.type === 'expense') deltaMap[key] -= t.amount;
    });

    const points = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDay);
      d.setDate(startDay.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      runningBalance += (deltaMap[key] || 0);
      points.push({
        date:    key,
        label:   d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance: runningBalance,
      });
    }
    return points;
  },
};

/* Export for Node-based unit tests. Harmless in the browser, where there is
   no `module` and `SummaryEngine` stays a global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SummaryEngine };
}
