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

test('pay', async (t) => {
  await t.test('hours × rate, rounded to cents', () => {
    assert.equal(ShiftEngine.pay({ start: '09:00', end: '17:00', rate: 20 }), 160);
    assert.equal(ShiftEngine.pay({ start: '09:00', end: '12:30', rate: 18.5 }), 64.75); // 3.5h × 18.5
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

  await t.test('totals across all shifts', () => {
    assert.deepEqual(ShiftEngine.summarize(shifts), { count: 3, hours: 16, pay: 320 });
  });
  await t.test('limits to a date window', () => {
    assert.deepEqual(
      ShiftEngine.summarize(shifts, { from: '2026-06-01', to: '2026-06-30' }),
      { count: 2, hours: 12, pay: 240 },
    );
  });
  await t.test('empty list → zeros', () => {
    assert.deepEqual(ShiftEngine.summarize([]), { count: 0, hours: 0, pay: 0 });
  });
});
