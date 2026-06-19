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
};

/* Export for Node-based unit tests. Harmless in the browser, where there is
   no `module` and `ShiftEngine` stays a global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShiftEngine };
}
