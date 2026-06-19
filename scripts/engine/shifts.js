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

  /* Gross pay for a shift = hours × hourly rate, rounded to cents. */
  pay(shift) {
    return Math.round(this.hours(shift) * (Number(shift.rate) || 0) * 100) / 100;
  },

  /* Totals across shifts, optionally limited to a [from, to] date window
     (inclusive, YYYY-MM-DD). Returns { count, hours, pay }. */
  summarize(shifts, opts = {}) {
    const { from, to } = opts;
    const list = (shifts || []).filter(s =>
      (!from || s.date >= from) && (!to || s.date <= to));
    const hours = list.reduce((sum, s) => sum + this.hours(s), 0);
    const pay   = list.reduce((sum, s) => sum + this.pay(s),   0);
    return {
      count: list.length,
      hours: Math.round(hours * 100) / 100,
      pay:   Math.round(pay   * 100) / 100,
    };
  },
};

/* Export for Node-based unit tests. Harmless in the browser, where there is
   no `module` and `ShiftEngine` stays a global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShiftEngine };
}
