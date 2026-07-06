/* ============================================================
   summary.js — Pure calculation functions (no side effects)
   ============================================================ */

/* LOCAL calendar date as YYYY-MM-DD (toISOString is UTC and shifts the day
   for users east/west of UTC, which mis-bucketed balances by a day). */
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    /* round to cents — summing many floats otherwise drifts (e.g. a balance
       that should read 0.00 showing 0.000000001) */
    Object.keys(map).forEach(k => { map[k] = Math.round(map[k] * 100) / 100; });
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
      const cutoffStr  = ymd(cutoff);
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
      const key = ymd(d);
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

/* ============================================================
   PeriodEngine — shared week / month / year / all-time ranges
   Used by any panel that pages through time (Cash Flow, Dashboard
   overview). Keeps range math, labels, paging bounds and bar-chart
   bucketing in ONE place so every panel behaves identically.

   A period is { mode, offset }: mode ∈ 'week'|'month'|'year'|'all',
   offset 0 = current period, -1 = previous, +1 = next. Forward paging
   is capped at the current period (offset 0) so panels can never sail
   into empty future ranges; 'all' has no paging at all.
   ============================================================ */
const PeriodEngine = {
  MODES: ['week', 'month', 'year', 'all'],
  LABELS: { week: 'Week', month: 'Month', year: 'Year', all: 'All' },

  _ymd: ymd,

  /* Monday-based start of the week containing d (local midnight) */
  _weekStart(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7;      /* 0 = Monday … 6 = Sunday */
    x.setDate(x.getDate() - dow);
    return x;
  },

  /* Inclusive { from, to, label } ISO date strings for a period.
     `allTx` is only needed for 'all' (to find the earliest date). */
  range(mode, offset, allTx = []) {
    const now = new Date();
    if (mode === 'week') {
      const start = this._weekStart(now);
      start.setDate(start.getDate() + offset * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const opt = { month: 'short', day: 'numeric' };
      return {
        from: this._ymd(start),
        to: this._ymd(end),
        label: `${start.toLocaleDateString('en-US', opt)} – ${end.toLocaleDateString('en-US', opt)}`,
      };
    }
    if (mode === 'year') {
      const y = now.getFullYear() + offset;
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
    }
    if (mode === 'all') {
      const dates = allTx.map(t => t.date).filter(Boolean).sort();
      return { from: dates[0] || this._ymd(now), to: this._ymd(now), label: 'All time' };
    }
    /* month (default) */
    const d    = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      from: this._ymd(from),
      to: this._ymd(to),
      label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    };
  },

  /* Paging bounds. Forward is capped at the current period; 'all' is static. */
  canNext(mode, offset) { return mode !== 'all' && offset < 0; },
  canPrev(mode, _offset) { return mode !== 'all'; },

  /* Transactions inside an inclusive [from, to] window (ISO strings sort lexically) */
  filter(allTx, from, to) {
    return allTx.filter(t => t.date >= from && t.date <= to);
  },

  /* Bar-chart buckets for a period: an array of { label, income, expense,
     highlight? }. week → 7 days, month → 4 weeks, year → 12 months,
     all → one bucket per year of history. `highlight` marks the bucket
     containing today (only when viewing the current period). */
  buckets(mode, offset, allTx) {
    const now = new Date();

    if (mode === 'week') {
      const start = this._weekStart(now);
      start.setDate(start.getDate() + offset * 7);
      const todayKey = this._ymd(now);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push({ key: this._ymd(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), income: 0, expense: 0 });
      }
      const map = Object.fromEntries(days.map(d => [d.key, d]));
      allTx.forEach(t => {
        const b = map[t.date];
        if (!b) return;
        if (t.type === 'income')  b.income  += t.amount;
        if (t.type === 'expense') b.expense += t.amount;
      });
      days.forEach(d => { if (d.key === todayKey) d.highlight = true; });
      return days;
    }

    if (mode === 'year') {
      const year = now.getFullYear() + offset;
      const months = SummaryEngine.getMonthlyRollup(allTx, year);
      if (year === now.getFullYear()) months[now.getMonth()].highlight = true;
      return months;
    }

    if (mode === 'all') {
      const years = {};
      allTx.forEach(t => {
        const y = (t.date || '').slice(0, 4);
        if (!y) return;
        if (!years[y]) years[y] = { label: y, income: 0, expense: 0 };
        if (t.type === 'income')  years[y].income  += t.amount;
        if (t.type === 'expense') years[y].expense += t.amount;
      });
      const cy = String(now.getFullYear());
      return Object.keys(years).sort().map(k => ({ ...years[k], highlight: k === cy }));
    }

    /* month → weeks of the month */
    const dt    = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year  = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const weeks = [
      { label: 'Week 1', start: 1,  end: 7,           income: 0, expense: 0 },
      { label: 'Week 2', start: 8,  end: 14,          income: 0, expense: 0 },
      { label: 'Week 3', start: 15, end: 21,          income: 0, expense: 0 },
      { label: 'Week 4', start: 22, end: daysInMonth, income: 0, expense: 0 },
    ];
    allTx.forEach(t => {
      if (!t.date.startsWith(prefix)) return;
      const day = parseInt(t.date.slice(8));
      const wk  = weeks.find(w => day >= w.start && day <= w.end);
      if (!wk) return;
      if (t.type === 'income')  wk.income  += t.amount;
      if (t.type === 'expense') wk.expense += t.amount;
    });
    if (year === now.getFullYear() && month === now.getMonth() + 1) {
      const day = now.getDate();
      weeks.forEach(w => { w.highlight = day >= w.start && day <= w.end; });
    }
    return weeks;
  },
};

/* Export for Node-based unit tests. Harmless in the browser, where there is
   no `module` and both engines stay globals. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SummaryEngine, PeriodEngine };
}
