/* ============================================================
   insights.js — Pure forward-looking calculations (no side effects).
   Phase 1: cash-flow forecasting. Companion to summary.js.
   ============================================================ */

const InsightsEngine = {

  /* Project total balance forward, day by day.

     Method (deliberately explainable, not a black box):
       projected(day d) = current
                        + runRate * d            // trailing discretionary trend
                        - scheduled bills due by d // known recurring (subscriptions)
     with a ±band·σ·√d confidence range from daily-net volatility.

     - `current` is the live total from computeAccountBalances.
     - `runRate` is trailing net (income − expense, EXCLUDING subscription-
       tagged tx so scheduled bills aren't double-counted) per elapsed day.
     - `recurring` is the known scheduled items (active subscriptions),
       expanded across the horizon by their frequency.

     opts: { horizonDays=30, lookbackDays=90, recurring=[], asOf=new Date(), band=1 }
     Returns points[0..horizon] plus a summary (end balance, low point,
     below-zero detection, basis). */
  forecastBalance(transactions, accounts, opts = {}) {
    const {
      horizonDays  = 30,
      lookbackDays = 90,
      recurring    = [],
      asOf         = new Date(),
      band         = 1,
    } = opts;

    const SE = (typeof SummaryEngine !== 'undefined')
      ? SummaryEngine
      : require('./summary.js').SummaryEngine;

    const DAY = 86400000;
    const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const iso = d => startOfDay(d).toISOString().slice(0, 10);

    const balances = SE.computeAccountBalances(accounts, transactions);
    const current  = Object.values(balances).reduce((s, b) => s + b, 0);

    const today        = startOfDay(asOf);
    const todayStr     = iso(today);
    const lookbackStart = iso(new Date(today.getTime() - lookbackDays * DAY));

    /* elapsed days of real history (so a young account doesn't overstate the
       per-day run-rate), capped at the lookback window */
    const firstDate = transactions.length ? transactions.map(t => t.date).sort()[0] : todayStr;
    const ageDays   = Math.round((today - startOfDay(new Date(firstDate + 'T00:00:00'))) / DAY);
    const elapsed   = Math.max(1, Math.min(lookbackDays, ageDays || 1));

    /* daily net over the lookback, excluding subscription-tagged tx and
       transfers (transfers net to zero on the total balance) */
    const isSub = t => (t.tags || []).includes('subscription');
    const dailyNet = {};
    let windowNet = 0, sampleCount = 0;
    transactions.forEach(t => {
      if (t.date < lookbackStart || t.date > todayStr || isSub(t)) return;
      let eff = 0;
      if (t.type === 'income')       eff =  t.amount;
      else if (t.type === 'expense') eff = -t.amount;
      else return;
      dailyNet[t.date] = (dailyNet[t.date] || 0) + eff;
      windowNet += eff; sampleCount++;
    });
    const runRate = windowNet / elapsed;

    /* volatility: stddev of daily net across the elapsed days (zero-filled) */
    let vol = 0;
    if (elapsed > 1) {
      const mean = windowNet / elapsed;
      let sumSq = 0;
      for (let i = 0; i < elapsed; i++) {
        const v = dailyNet[iso(new Date(today.getTime() - i * DAY))] || 0;
        sumSq += (v - mean) ** 2;
      }
      vol = Math.sqrt(sumSq / elapsed);
    }

    /* expand scheduled recurring items across the horizon */
    const horizonEnd = startOfDay(new Date(today.getTime() + horizonDays * DAY));
    const stepDate = (d, freq) => {
      const x = new Date(d);
      if (freq === 'weekly')      x.setDate(x.getDate() + 7);
      else if (freq === 'yearly') x.setFullYear(x.getFullYear() + 1);
      else                        x.setMonth(x.getMonth() + 1);
      return x;
    };
    const scheduled = [];
    recurring.forEach(r => {
      if (!r || !r.nextDue || !(r.amount > 0)) return;
      let due = startOfDay(new Date(r.nextDue + 'T00:00:00'));
      let guard = 0;
      while (due <= horizonEnd && guard++ < 500) {
        if (due >= today) scheduled.push({ date: iso(due), amount: r.amount, name: r.name || 'Recurring' });
        due = stepDate(due, r.frequency);
      }
    });
    const schedByDate = {};
    scheduled.forEach(s => { schedByDate[s.date] = (schedByDate[s.date] || 0) + s.amount; });

    /* day-by-day projection. The band is capped so a volatile history can't
       balloon it into a meaningless cone that dwarfs the actual balance. */
    const maxSpread = Math.abs(current) * 0.25 + 50;
    const points = [];
    let low = { balance: current, date: todayStr };
    let cumSched = 0;
    for (let d = 0; d <= horizonDays; d++) {
      const date = iso(new Date(today.getTime() + d * DAY));
      cumSched += (schedByDate[date] || 0);
      const balance = current + runRate * d - cumSched;
      const spread  = Math.min(band * vol * Math.sqrt(d), maxSpread);
      points.push({
        date,
        label:   new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance,
        lower:   balance - spread,
        upper:   balance + spread,
      });
      if (balance < low.balance) low = { balance, date };
    }

    const end          = points[points.length - 1];
    const belowZero    = points.find(p => p.balance < 0) || null;
    const riskBelow    = points.find(p => p.lower   < 0) || null;

    return {
      current,
      points,
      horizonDays,
      endBalance:    end.balance,
      endDate:       end.date,
      projectedNet:  end.balance - current,
      runRate,
      volatility:    vol,
      scheduled,
      scheduledTotal: scheduled.reduce((s, x) => s + x.amount, 0),
      low,
      belowZero:     !!belowZero,
      belowZeroDate: belowZero ? belowZero.date : null,
      riskBelowZero: !!riskBelow,
      basis:         { lookbackDays: elapsed, sampleCount },
    };
  },
  /* Recommend a monthly budget per expense category from trailing history.
     Averages each category's spend over the `months` complete calendar
     months before `asOf` (the current, partial month is excluded so a
     half-finished month doesn't drag the average down), then rounds for
     tidiness with a little headroom. Months with no spend count as 0, so
     sporadic categories get a conservative figure.

     opts: { months=3, asOf=new Date() }
     Returns [{ categoryId, amount, monthlyAvg, monthsWithData }] desc. */
  recommendBudgets(transactions, opts = {}) {
    const { months = 3, asOf = new Date() } = opts;
    const ref = new Date(asOf); ref.setDate(1); ref.setHours(0, 0, 0, 0);

    const keySet = new Set();
    for (let i = 1; i <= months; i++) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      keySet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const byCat = {};
    transactions.forEach(t => {
      if (t.type !== 'expense' || !t.categoryId) return;
      if (!keySet.has(t.date.slice(0, 7))) return;
      const c = byCat[t.categoryId] || (byCat[t.categoryId] = { total: 0, monthsSeen: new Set() });
      c.total += t.amount;
      c.monthsSeen.add(t.date.slice(0, 7));
    });

    const round = v => v >= 10 ? Math.ceil(v / 5) * 5 : Math.max(1, Math.ceil(v));
    return Object.entries(byCat)
      .map(([categoryId, c]) => ({
        categoryId,
        amount:         round(c.total / months),
        monthlyAvg:     c.total / months,
        monthsWithData: c.monthsSeen.size,
      }))
      .filter(r => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  },
};

/* Export for Node-based unit tests. Harmless in the browser, where there is
   no `module` and `InsightsEngine` stays a global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InsightsEngine };
}
