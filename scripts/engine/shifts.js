/* ============================================================
   shifts.js — Pure work-shift calculations (no side effects).
   Hours worked and pay from a shift; period rollups.
   ============================================================ */

const ShiftEngine = {

  /* Decimal hours worked for a shift. Handles a break (minutes) and an
     overnight shift (end earlier than start → crosses midnight). */
  hours(shift) {
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

  /* Monday-based week start (YYYY-MM-DD) for a date string. Pure: no locale,
     no DOM. Mirrors the page helper so analytics can group by week. */
  weekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = (d.getDay() + 6) % 7;          /* 0 = Monday */
    d.setDate(d.getDate() - dow);
    return d.toISOString().slice(0, 10);
  },

  /* Earnings/hours grouped by day of week, Monday→Sunday. Returns a length-7
     array of { dow, hours, pay, count } where dow 0 = Monday. Useful for a
     "when do you work" distribution bar chart. */
  byDayOfWeek(shifts, opts = {}) {
    const { from, to } = opts;
    const buckets = Array.from({ length: 7 }, (_, i) => ({ dow: i, hours: 0, pay: 0, count: 0 }));
    (shifts || []).forEach(s => {
      if ((from && s.date < from) || (to && s.date > to)) return;
      const d = new Date(s.date + 'T00:00:00');
      const i = (d.getDay() + 6) % 7;
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

  /* A continuous series of the last `weeks` Monday-weeks ending with the week
     containing `today` (default: now). Every week is present even with no
     shifts, so a bar chart shows real gaps. Returns
     [{ weekStart, hours, pay, count }] oldest→newest. */
  weeklySeries(shifts, weeks = 10, today = new Date().toISOString().slice(0, 10)) {
    const thisWeek = this.weekStart(today);
    const series = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(thisWeek + 'T00:00:00');
      d.setDate(d.getDate() - i * 7);
      const ws = d.toISOString().slice(0, 10);
      const we = new Date(ws + 'T00:00:00'); we.setDate(we.getDate() + 6);
      const sum = this.summarize(shifts, { from: ws, to: we.toISOString().slice(0, 10) });
      series.push({ weekStart: ws, hours: sum.hours, pay: sum.pay, count: sum.count });
    }
    return series;
  },
};

/* Export for Node-based unit tests. Harmless in the browser, where there is
   no `module` and `ShiftEngine` stays a global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShiftEngine };
}
