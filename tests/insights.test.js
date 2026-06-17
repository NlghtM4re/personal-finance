/* ============================================================
   Unit tests for InsightsEngine (scripts/engine/insights.js).
   Pure forecasting math. Node's built-in runner.

   Run:  node --test tests/      (or: npm test)
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const { InsightsEngine } = require('../scripts/engine/insights.js');

/* Fixed "now" so date math is deterministic. */
const ASOF = new Date('2026-06-16T12:00:00');
const DAY = 86400000;
const daysBefore = n => new Date(ASOF.getTime() - n * DAY).toISOString().slice(0, 10);
const daysAfter  = n => new Date(ASOF.getTime() + n * DAY).toISOString().slice(0, 10);

const ACCT = [{ id: 'a', initialBalance: 1000 }];

test('forecastBalance — shape & horizon', async (t) => {
  await t.test('returns horizon+1 points, day 0 is today at current balance', () => {
    const fc = InsightsEngine.forecastBalance([], ACCT, { horizonDays: 30, asOf: ASOF });
    assert.equal(fc.points.length, 31);
    assert.equal(fc.points[0].balance, 1000);
    assert.equal(fc.current, 1000);
    assert.equal(fc.endDate, daysAfter(30));
  });

  await t.test('no history and no bills → flat projection at current balance', () => {
    const fc = InsightsEngine.forecastBalance([], ACCT, { horizonDays: 30, asOf: ASOF });
    assert.ok(fc.points.every(p => p.balance === 1000));
    assert.equal(fc.projectedNet, 0);
    assert.equal(fc.belowZero, false);
    assert.equal(fc.basis.sampleCount, 0);
  });
});

test('forecastBalance — run-rate trend', async (t) => {
  await t.test('a steady daily surplus projects upward', () => {
    // +30/day income across the last 30 days → runRate ≈ +30/day
    const txns = [];
    for (let i = 1; i <= 30; i++) txns.push({ type: 'income', amount: 30, date: daysBefore(i), accountId: 'a' });
    const fc = InsightsEngine.forecastBalance(txns, ACCT, { horizonDays: 30, lookbackDays: 90, asOf: ASOF });
    assert.ok(fc.runRate > 25 && fc.runRate < 35, `runRate ~30, got ${fc.runRate}`);
    assert.ok(fc.endBalance > fc.current, 'ends higher than current');
    assert.ok(fc.projectedNet > 0);
  });

  await t.test('a steady daily deficit projects below zero and flags it', () => {
    // start at 4000, spend 100/day for 30 days → current = 1000 (still positive),
    // runRate ≈ -100/day, so the trend crosses zero ~11 days out (in the future)
    const acct = [{ id: 'a', initialBalance: 4000 }];
    const txns = [];
    for (let i = 1; i <= 30; i++) txns.push({ type: 'expense', amount: 100, date: daysBefore(i), accountId: 'a' });
    const fc = InsightsEngine.forecastBalance(txns, acct, { horizonDays: 30, lookbackDays: 90, asOf: ASOF });
    assert.equal(fc.current, 1000);
    assert.ok(fc.runRate < -90, `runRate strongly negative, got ${fc.runRate}`);
    assert.equal(fc.belowZero, true);
    assert.ok(fc.belowZeroDate > daysBefore(0), 'below-zero date is in the future');
    assert.ok(fc.low.balance < 0);
  });
});

test('forecastBalance — scheduled recurring bills', async (t) => {
  await t.test('a bill due inside the horizon reduces the projected balance', () => {
    const recurring = [{ amount: 200, frequency: 'monthly', nextDue: daysAfter(10), name: 'Rent' }];
    const flat = InsightsEngine.forecastBalance([], ACCT, { horizonDays: 30, asOf: ASOF });
    const withBill = InsightsEngine.forecastBalance([], ACCT, { horizonDays: 30, asOf: ASOF, recurring });
    assert.equal(withBill.scheduled.length, 1);
    assert.equal(withBill.endBalance, flat.endBalance - 200);
    // balance is unchanged before the due date, dropped on/after it
    assert.equal(withBill.points[9].balance, 1000);
    assert.equal(withBill.points[10].balance, 800);
  });

  await t.test('weekly bills recur multiple times within the horizon', () => {
    const recurring = [{ amount: 10, frequency: 'weekly', nextDue: daysAfter(1), name: 'Weekly' }];
    const fc = InsightsEngine.forecastBalance([], ACCT, { horizonDays: 30, asOf: ASOF, recurring });
    assert.ok(fc.scheduled.length >= 4, `expected >=4 weekly occurrences, got ${fc.scheduled.length}`);
  });

  await t.test('subscription-tagged history is excluded from the run-rate (no double count)', () => {
    const txns = [];
    for (let i = 1; i <= 30; i++) txns.push({ type: 'expense', amount: 50, date: daysBefore(i), accountId: 'a', tags: ['subscription'] });
    const fc = InsightsEngine.forecastBalance(txns, ACCT, { horizonDays: 30, lookbackDays: 90, asOf: ASOF });
    assert.equal(fc.runRate, 0, 'tagged subscription spend does not move the trend');
    assert.equal(fc.basis.sampleCount, 0);
  });
});

test('forecastBalance — variance band & transfers', async (t) => {
  await t.test('the confidence band widens further into the future', () => {
    // alternating swings create volatility
    const txns = [];
    for (let i = 1; i <= 30; i++) txns.push({ type: i % 2 ? 'income' : 'expense', amount: 100, date: daysBefore(i), accountId: 'a' });
    const fc = InsightsEngine.forecastBalance(txns, ACCT, { horizonDays: 30, lookbackDays: 90, asOf: ASOF });
    assert.ok(fc.volatility > 0, 'has volatility');
    const w1  = fc.points[1].upper  - fc.points[1].lower;
    const w30 = fc.points[30].upper - fc.points[30].lower;
    assert.ok(w30 > w1, 'band at day 30 wider than at day 1');
  });

  await t.test('transfers do not affect the trend', () => {
    const txns = [{ type: 'transfer', amount: 500, date: daysBefore(5), accountId: 'a', toAccountId: 'b' }];
    const fc = InsightsEngine.forecastBalance(txns, [{ id: 'a', initialBalance: 1000 }, { id: 'b', initialBalance: 0 }], { horizonDays: 30, asOf: ASOF });
    assert.equal(fc.runRate, 0);
    assert.ok(fc.points.every(p => p.balance === 1000));
  });
});
