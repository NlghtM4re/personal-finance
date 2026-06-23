/* ============================================================
   Unit tests for ShiftEngine (scripts/engine/shifts.js).
   Pure functions. Node's built-in runner.

   Run:  node --test tests/      (or: npm test)
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const { ShiftEngine } = require('../scripts/engine/shifts.js');

test('hours', async (t) => {
  await t.test('plain shift', () => {
    assert.equal(ShiftEngine.hours({ start: '09:00', end: '17:00' }), 8);
  });
  await t.test('subtracts the break', () => {
    assert.equal(ShiftEngine.hours({ start: '09:00', end: '17:00', breakMin: 30 }), 7.5);
  });
  await t.test('handles an overnight shift (crosses midnight)', () => {
    assert.equal(ShiftEngine.hours({ start: '22:00', end: '06:00' }), 8);
  });
  await t.test('never negative; tolerates missing/blank times', () => {
    assert.equal(ShiftEngine.hours({ start: '09:00', end: '09:00', breakMin: 30 }), 0);
    assert.equal(ShiftEngine.hours({}), 0);
  });
});

test('hours — direct entry (the "just total hours" path)', async (t) => {
  await t.test('uses a direct hours value when present, ignoring times', () => {
    assert.equal(ShiftEngine.hours({ hours: 6.5 }), 6.5);
    // direct value wins even if start/end are also set
    assert.equal(ShiftEngine.hours({ hours: 5, start: '09:00', end: '17:00' }), 5);
  });
  await t.test('falls back to start/end when hours is missing or zero', () => {
    assert.equal(ShiftEngine.hours({ start: '09:00', end: '17:00' }), 8);
    assert.equal(ShiftEngine.hours({ hours: 0, start: '09:00', end: '17:00' }), 8);
  });
  await t.test('pay uses direct hours × rate', () => {
    assert.equal(ShiftEngine.pay({ hours: 4, rate: 17 }), 68);
  });
});

test('pay', async (t) => {
  await t.test('hourly: hours × rate, rounded to cents', () => {
    assert.equal(ShiftEngine.pay({ start: '09:00', end: '17:00', rate: 20 }), 160);
    assert.equal(ShiftEngine.pay({ start: '09:00', end: '12:30', rate: 18.5 }), 64.75); // 3.5h × 18.5
  });
  await t.test('fixed pay mode: uses the flat amount, ignores rate/hours', () => {
    assert.equal(ShiftEngine.pay({ start: '09:00', end: '17:00', payMode: 'fixed', fixedPay: 120, rate: 20 }), 120);
    assert.equal(ShiftEngine.basePay({ payMode: 'fixed', fixedPay: 95 }), 95);
  });
  await t.test('tips add on top of base pay (either mode)', () => {
    assert.equal(ShiftEngine.pay({ start: '09:00', end: '17:00', rate: 20, tips: 15 }), 175);
    assert.equal(ShiftEngine.pay({ payMode: 'fixed', fixedPay: 100, tips: 25 }), 125);
  });
  await t.test('no rate → 0', () => {
    assert.equal(ShiftEngine.pay({ start: '09:00', end: '17:00' }), 0);
  });
});

test('summarize', async (t) => {
  const shifts = [
    { date: '2026-06-01', start: '09:00', end: '17:00', rate: 20 }, // 8h, $160
    { date: '2026-06-15', start: '10:00', end: '14:00', rate: 20 }, // 4h, $80
    { date: '2026-05-20', start: '09:00', end: '13:00', rate: 20 }, // 4h, $80 (prior month)
  ];

  await t.test('totals across all shifts (incl. tips)', () => {
    assert.deepEqual(ShiftEngine.summarize(shifts), { count: 3, hours: 16, pay: 320, tips: 0 });
    const withTips = [{ date: '2026-06-01', start: '09:00', end: '17:00', rate: 20, tips: 10 }];
    assert.deepEqual(ShiftEngine.summarize(withTips), { count: 1, hours: 8, pay: 170, tips: 10 });
  });
  await t.test('limits to a date window', () => {
    assert.deepEqual(
      ShiftEngine.summarize(shifts, { from: '2026-06-01', to: '2026-06-30' }),
      { count: 2, hours: 12, pay: 240, tips: 0 },
    );
  });
  await t.test('empty list → zeros', () => {
    assert.deepEqual(ShiftEngine.summarize([]), { count: 0, hours: 0, pay: 0, tips: 0 });
  });
});

test('effectiveRate', async (t) => {
  await t.test('total pay / total hours (tips included)', () => {
    const shifts = [
      { start: '09:00', end: '17:00', rate: 20 },         // 8h, $160
      { start: '10:00', end: '14:00', rate: 25, tips: 8 }, // 4h, $108
    ];
    // 268 / 12 = 22.333… → 22.33
    assert.equal(ShiftEngine.effectiveRate(shifts), 22.33);
  });
  await t.test('no hours (only flat-pay) → 0', () => {
    assert.equal(ShiftEngine.effectiveRate([{ payMode: 'fixed', fixedPay: 100 }]), 0);
    assert.equal(ShiftEngine.effectiveRate([]), 0);
  });
});

test('unpaidSummary', async (t) => {
  const shifts = [
    { date: '2026-06-15', hours: 8, rate: 17 },              // unpaid: 136
    { date: '2026-06-16', hours: 7.5, rate: 17, tips: 5 },   // unpaid: 132.50
    { date: '2026-06-10', hours: 8, rate: 17, paid: true },  // already paid — excluded
  ];
  await t.test('sums only shifts not yet covered by a payout', () => {
    assert.deepEqual(ShiftEngine.unpaidSummary(shifts), { count: 2, hours: 15.5, estimated: 268.5 });
  });
  await t.test('empty / all-paid → zeros', () => {
    assert.deepEqual(ShiftEngine.unpaidSummary([]), { count: 0, hours: 0, estimated: 0 });
    assert.deepEqual(ShiftEngine.unpaidSummary([{ hours: 8, rate: 17, paid: true }]),
      { count: 0, hours: 0, estimated: 0 });
  });
});

test('settlePay (estimate vs actual)', async (t) => {
  await t.test('actual above estimate → positive bonus', () => {
    assert.deepEqual(ShiftEngine.settlePay(399.5, 410), { estimated: 399.5, actual: 410, bonus: 10.5 });
  });
  await t.test('exact pay → zero bonus', () => {
    assert.deepEqual(ShiftEngine.settlePay(340, 340), { estimated: 340, actual: 340, bonus: 0 });
  });
  await t.test('underpaid → negative bonus; rounds to cents', () => {
    const r = ShiftEngine.settlePay(100.005, 90);
    assert.equal(r.estimated, 100.01);
    assert.equal(r.bonus, -10.01);
  });
});

test('weekStart (Sunday-based)', async (t) => {
  await t.test('snaps any weekday back to its Sunday', () => {
    assert.equal(ShiftEngine.weekStart('2026-06-17'), '2026-06-14'); // Wed → Sun
    assert.equal(ShiftEngine.weekStart('2026-06-14'), '2026-06-14'); // Sun → itself
    assert.equal(ShiftEngine.weekStart('2026-06-20'), '2026-06-14'); // Sat → Sun
  });
});

test('byDayOfWeek', async (t) => {
  const shifts = [
    { date: '2026-06-15', start: '09:00', end: '17:00', rate: 20 }, // Mon, 8h $160
    { date: '2026-06-22', start: '09:00', end: '13:00', rate: 20 }, // Mon, 4h $80
    { date: '2026-06-20', start: '10:00', end: '14:00', rate: 30 }, // Sat, 4h $120
  ];
  await t.test('buckets Sun→Sat and accumulates', () => {
    const rows = ShiftEngine.byDayOfWeek(shifts);
    assert.equal(rows.length, 7);
    assert.deepEqual(rows[1], { dow: 1, hours: 12, pay: 240, count: 2 }); // Monday
    assert.deepEqual(rows[6], { dow: 6, hours: 4, pay: 120, count: 1 });  // Saturday
    assert.deepEqual(rows[3], { dow: 3, hours: 0, pay: 0, count: 0 });    // empty Wednesday
  });
});

test('byEmployer', async (t) => {
  const shifts = [
    { date: '2026-06-15', employer: 'Café', start: '09:00', end: '17:00', rate: 20 }, // 8h $160
    { date: '2026-06-16', employer: 'Café', start: '09:00', end: '13:00', rate: 20 }, // 4h $80
    { date: '2026-06-17', employer: 'Bar',  start: '18:00', end: '22:00', rate: 25 }, // 4h $100
    { date: '2026-06-18', start: '10:00', end: '12:00', rate: 15 },                   // 2h $30, no employer
  ];
  await t.test('groups, sorts by pay desc, folds blanks into Unspecified, derives rate', () => {
    const rows = ShiftEngine.byEmployer(shifts);
    assert.equal(rows[0].employer, 'Café');
    assert.deepEqual(
      { employer: rows[0].employer, hours: rows[0].hours, pay: rows[0].pay, count: rows[0].count, rate: rows[0].rate },
      { employer: 'Café', hours: 12, pay: 240, count: 2, rate: 20 },
    );
    assert.equal(rows[1].employer, 'Bar');
    assert.equal(rows[2].employer, 'Unspecified');
    assert.equal(rows[2].rate, 15);
  });
});

test('weeklySeries', async (t) => {
  const shifts = [
    { date: '2026-06-15', start: '09:00', end: '17:00', rate: 20 }, // this week (Sun 6/14)
    { date: '2026-06-08', start: '09:00', end: '13:00', rate: 20 }, // prior week (Sun 6/7)
  ];
  await t.test('returns N continuous weeks ending with today\'s week, oldest→newest', () => {
    const series = ShiftEngine.weeklySeries(shifts, 4, '2026-06-17');
    assert.equal(series.length, 4);
    assert.equal(series[3].weekStart, '2026-06-14'); // newest = current week
    assert.equal(series[3].pay, 160);
    assert.equal(series[2].weekStart, '2026-06-07');
    assert.equal(series[2].pay, 80);
    assert.equal(series[0].pay, 0);                  // gap week present with zeros
  });
});
