/* ============================================================
   shifts.js — Pure work-shift calculations (no side effects).
   Hours worked and pay from a shift; period rollups.
   ============================================================ */

/* LOCAL calendar date as YYYY-MM-DD (not toISOString, which is UTC and
   shifts the day for users east/west of UTC — and across test machines). */
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ShiftEngine = {

  /* Decimal hours worked for a shift. A direct `hours` value (the fast
     "just total hours" log path) wins when present; otherwise computed from
     start/end with a break (minutes) and overnight support (end earlier than
     start → crosses midnight). */
  hours(shift) {
    const direct = Number(shift && shift.hours);
    if (Number.isFinite(direct) && direct > 0) return Math.round(direct * 100) / 100;
    const toMin = t => {
      const [h, m] = String(t || '').split(':').map(Number);
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };
    let mins = toMin(shift.end) - toMin(shift.start);
    if (mins < 0) mins += 24 * 60;          /* overnight */
    mins -= (Number(shift.breakMin) || 0);
    return Math.max(0, mins) / 60;
  },

  /* Base pay before tips. payMode 'fixed' → a flat amount you were paid;
     otherwise hours × hourly rate. Rounded to cents. */
  basePay(shift) {
    const v = (shift && shift.payMode === 'fixed')
      ? (Number(shift.fixedPay) || 0)
      : this.hours(shift) * (Number(shift && shift.rate) || 0);
    return Math.round(v * 100) / 100;
  },

  /* Total earnings for a shift = base pay + tips. */
  pay(shift) {
    return Math.round((this.basePay(shift) + (Number(shift && shift.tips) || 0)) * 100) / 100;
  },

  /* Totals across shifts, optionally limited to a [from, to] date window
     (inclusive, YYYY-MM-DD). Returns { count, hours, pay, tips }. */
  summarize(shifts, opts = {}) {
    const { from, to } = opts;
    const list = (shifts || []).filter(s =>
      (!from || s.date >= from) && (!to || s.date <= to));
    const sum = fn => Math.round(list.reduce((acc, s) => acc + fn(s), 0) * 100) / 100;
    return {
      count: list.length,
      hours: sum(s => this.hours(s)),
      pay:   sum(s => this.pay(s)),
      tips:  sum(s => Number(s.tips) || 0),
    };
  },

  /* Effective hourly rate over a set of shifts = total pay / total hours.
     Tips count toward pay, so this is the real $/h you took home. 0 when no
     hours were worked (e.g. only flat-pay shifts). Rounded to cents. */
  effectiveRate(shifts, opts = {}) {
    const s = this.summarize(shifts, opts);
    return s.hours > 0 ? Math.round((s.pay / s.hours) * 100) / 100 : 0;
  },

  /* Everything worked but not yet covered by a payout. A shift is "unpaid"
     when its `paid` flag is falsy (the page sets this from payout coverage).
     Returns { count, hours, estimated } where estimated = sum of pay()
     (hours × rate, or the flat amount, plus tips). */
  unpaidSummary(shifts) {
    const list = (shifts || []).filter(s => !s.paid);
    const sum = fn => Math.round(list.reduce((acc, s) => acc + fn(s), 0) * 100) / 100;
    return { count: list.length, hours: sum(s => this.hours(s)), estimated: sum(s => this.pay(s)) };
  },

  /* Reconcile an estimated payout against the actual cash received. The
     difference is the boss's rounding-up "bonus" (negative if underpaid).
     Pure money math, rounded to cents. */
  settlePay(estimated, actual) {
    const r = v => Math.round((Number(v) || 0) * 100) / 100;
    const est = r(estimated), act = r(actual);
    return { estimated: est, actual: act, bonus: r(act - est) };
  },

  /* Sunday-based week start (YYYY-MM-DD) for a date string. Pure: no locale,
     no DOM. Mirrors the page helper so analytics can group by week. */
  weekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();                     /* 0 = Sunday */
    d.setDate(d.getDate() - dow);
    return ymd(d);
  },

  /* Earnings/hours grouped by day of week, Sunday→Saturday. Returns a length-7
     array of { dow, hours, pay, count } where dow 0 = Sunday. Useful for a
     "when do you work" distribution bar chart. */
  byDayOfWeek(shifts, opts = {}) {
    const { from, to } = opts;
    const buckets = Array.from({ length: 7 }, (_, i) => ({ dow: i, hours: 0, pay: 0, count: 0 }));
    (shifts || []).forEach(s => {
      if ((from && s.date < from) || (to && s.date > to)) return;
      const d = new Date(s.date + 'T00:00:00');
      const i = d.getDay();
      buckets[i].hours += this.hours(s);
      buckets[i].pay   += this.pay(s);
      buckets[i].count += 1;
    });
    return buckets.map(b => ({ ...b, hours: Math.round(b.hours * 100) / 100, pay: Math.round(b.pay * 100) / 100 }));
  },

  /* Totals grouped by employer/job, sorted by pay (desc). Returns
     [{ employer, hours, pay, count, rate }]. Blank employers fold into
     "Unspecified". `rate` is the per-job effective hourly rate. */
  byEmployer(shifts, opts = {}) {
    const { from, to } = opts;
    const map = new Map();
    (shifts || []).forEach(s => {
      if ((from && s.date < from) || (to && s.date > to)) return;
      const key = (s.employer || '').trim() || 'Unspecified';
      const g = map.get(key) || { employer: key, hours: 0, pay: 0, count: 0 };
      g.hours += this.hours(s);
      g.pay   += this.pay(s);
      g.count += 1;
      map.set(key, g);
    });
    return Array.from(map.values())
      .map(g => ({
        ...g,
        hours: Math.round(g.hours * 100) / 100,
        pay:   Math.round(g.pay * 100) / 100,
        rate:  g.hours > 0 ? Math.round((g.pay / g.hours) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.pay - a.pay);
  },

  /* A continuous series of the last `weeks` Sunday-weeks ending with the week
     containing `today` (default: now). Every week is present even with no
     shifts, so a bar chart shows real gaps. Returns
     [{ weekStart, hours, pay, count }] oldest→newest. */
  weeklySeries(shifts, weeks = 10, today = ymd(new Date())) {
    const thisWeek = this.weekStart(today);
    const series = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(thisWeek + 'T00:00:00');
      d.setDate(d.getDate() - i * 7);
      const ws = ymd(d);
      const we = new Date(ws + 'T00:00:00'); we.setDate(we.getDate() + 6);
      const sum = this.summarize(shifts, { from: ws, to: ymd(we) });
      series.push({ weekStart: ws, hours: sum.hours, pay: sum.pay, count: sum.count });
    }
    return series;
  },

  /* ---- salary projection -------------------------------------------------
     Average pay of a typical WORKED week — the basis for the salary figures.
     Averages only weeks that actually had shifts over the look-back window, so
     an off week (no work) doesn't drag the number toward zero. Returns
     { weekly, workedWeeks }; weekly is 0 when nothing was logged. */
  averageWeeklyPay(shifts, opts = {}) {
    const { weeks = 8, today = ymd(new Date()) } = opts;
    const worked = this.weeklySeries(shifts, weeks, today).filter(w => w.count > 0);
    if (!worked.length) return { weekly: 0, workedWeeks: 0 };
    const total = worked.reduce((a, w) => a + w.pay, 0);
    return { weekly: Math.round((total / worked.length) * 100) / 100, workedWeeks: worked.length };
  },

  /* Project a weekly pay to month and year. A month is 52/12 weeks so the
     monthly figure is consistent with annual = weekly × 52. */
  projectSalary(weekly) {
    const w = Number(weekly) || 0;
    return {
      weekly:  Math.round(w * 100) / 100,
      monthly: Math.round((w * 52 / 12) * 100) / 100,
      annual:  Math.round(w * 52 * 100) / 100,
    };
  },

  /* The REAL deductions visible in your own data: the gap between what your
     shifts were estimated to pay and what you were actually paid out.
       deduction > 0 → you received LESS than estimated (real deductions)
       deduction < 0 → you received MORE (e.g. a boss who rounds up — a bonus)
     `rate` is deduction / estimated. Zeros when there are no payouts. */
  payoutDeductions(payouts) {
    const list = payouts || [];
    const r = n => Math.round(n * 100) / 100;
    const estimated = r(list.reduce((a, p) => a + (Number(p.estimated) || 0), 0));
    const actual    = r(list.reduce((a, p) => a + (Number(p.actual)    || 0), 0));
    const deduction = r(estimated - actual);
    return { count: list.length, estimated, actual, deduction, rate: estimated > 0 ? deduction / estimated : 0 };
  },
};

/* Export for Node-based unit tests. Harmless in the browser, where there is
   no `module` and `ShiftEngine` stays a global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShiftEngine };
}
