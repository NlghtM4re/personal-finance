/* ============================================================
   Unit tests for SummaryEngine (scripts/engine/summary.js).
   Pure functions, zero dependencies — Node's built-in runner.

   Run:  node --test tests/      (or: npm test)
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const { SummaryEngine } = require('../scripts/engine/summary.js');

/* Build a YYYY-MM-DD string N days before today (local clock). */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test('getTotals', async (t) => {
  await t.test('sums income and expense, counts all, leaves net at 0', () => {
    const txns = [
      { type: 'income',   amount: 100 },
      { type: 'income',   amount: 50 },
      { type: 'expense',  amount: 30 },
      { type: 'transfer', amount: 200 }, // ignored by income/expense
    ];
    const r = SummaryEngine.getTotals(txns);
    assert.equal(r.income, 150);
    assert.equal(r.expense, 30);
    assert.equal(r.count, 4);    // counts every transaction, transfers included
    assert.equal(r.net, 0);      // net is finalized separately
  });

  await t.test('empty list is all zeros', () => {
    assert.deepEqual(SummaryEngine.getTotals([]), { income: 0, expense: 0, net: 0, count: 0 });
  });
});

test('finalizeTotals computes net = income - expense', () => {
  const acc = SummaryEngine.getTotals([
    { type: 'income',  amount: 150 },
    { type: 'expense', amount: 30 },
  ]);
  assert.equal(SummaryEngine.finalizeTotals(acc).net, 120);
});

test('computeAccountBalances', async (t) => {
  const accounts = [
    { id: 'a', initialBalance: 100 },
    { id: 'b', initialBalance: 0 },
  ];

  await t.test('applies income, expense, and transfers across accounts', () => {
    const txns = [
      { type: 'income',   accountId: 'a', amount: 50 },                  // a: 150
      { type: 'expense',  accountId: 'a', amount: 20 },                  // a: 130
      { type: 'transfer', accountId: 'a', toAccountId: 'b', amount: 40 }, // a: 90, b: 40
    ];
    assert.deepEqual(SummaryEngine.computeAccountBalances(accounts, txns), { a: 90, b: 40 });
  });

  await t.test('ignores transactions on unknown accounts', () => {
    const txns = [{ type: 'expense', accountId: 'ghost', amount: 999 }];
    assert.deepEqual(SummaryEngine.computeAccountBalances(accounts, txns), { a: 100, b: 0 });
  });

  await t.test('starts from initial balances when there are no transactions', () => {
    assert.deepEqual(SummaryEngine.computeAccountBalances(accounts, []), { a: 100, b: 0 });
  });
});

test('getByCategory', async (t) => {
  const txns = [
    { type: 'expense', categoryId: 'food', amount: 10 },
    { type: 'expense', categoryId: 'food', amount: 5 },
    { type: 'expense', categoryId: 'rent', amount: 100 },
    { type: 'income',  categoryId: 'salary', amount: 1000 },
  ];

  await t.test('defaults to expense, groups by category, sorts descending', () => {
    assert.deepEqual(SummaryEngine.getByCategory(txns), [
      { categoryId: 'rent', total: 100 },
      { categoryId: 'food', total: 15 },
    ]);
  });

  await t.test('filters by the requested type', () => {
    assert.deepEqual(SummaryEngine.getByCategory(txns, 'income'), [
      { categoryId: 'salary', total: 1000 },
    ]);
  });

  await t.test('empty list yields empty array', () => {
    assert.deepEqual(SummaryEngine.getByCategory([]), []);
  });
});

test('getMonthlyRollup', async (t) => {
  const txns = [
    { type: 'income',  amount: 1000, date: '2026-01-15' },
    { type: 'expense', amount: 200,  date: '2026-01-20' },
    { type: 'income',  amount: 500,  date: '2026-03-01' },
    { type: 'expense', amount: 50,   date: '2025-12-31' }, // prior year — ignored
  ];
  const months = SummaryEngine.getMonthlyRollup(txns, 2026);

  await t.test('returns 12 months with short labels', () => {
    assert.equal(months.length, 12);
    assert.equal(months[0].label, 'Jan');
    assert.equal(months[11].label, 'Dec');
  });

  await t.test('buckets income/expense by month and computes net', () => {
    assert.deepEqual(
      { income: months[0].income, expense: months[0].expense, net: months[0].net },
      { income: 1000, expense: 200, net: 800 },
    );
    assert.deepEqual(
      { income: months[2].income, expense: months[2].expense, net: months[2].net },
      { income: 500, expense: 0, net: 500 },
    );
  });

  await t.test('ignores transactions from other years', () => {
    assert.equal(months[11].expense, 0); // the 2025-12-31 expense did not leak in
  });
});

test('getBalanceOverTime', async (t) => {
  const accounts = [{ id: 'a', initialBalance: 100 }, { id: 'b', initialBalance: 50 }];

  await t.test('returns exactly `days` points with ascending YYYY-MM-DD dates', () => {
    const pts = SummaryEngine.getBalanceOverTime([], accounts, 10);
    assert.equal(pts.length, 10);
    for (const p of pts) {
      assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof p.balance, 'number');
      assert.equal(typeof p.label, 'string');
    }
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i].date > pts[i - 1].date);
  });

  await t.test('with no transactions every point equals total initial balance', () => {
    const pts = SummaryEngine.getBalanceOverTime([], accounts, 10);
    assert.ok(pts.every(p => p.balance === 150));
  });

  await t.test('rolls pre-window transactions into the opening balance', () => {
    // dated well before a 5-day window, so they land in `beforeWindow`
    const txns = [
      { type: 'income',  accountId: 'a', amount: 200, date: daysAgo(400) },
      { type: 'expense', accountId: 'a', amount: 50,  date: daysAgo(400) },
    ];
    const pts = SummaryEngine.getBalanceOverTime(txns, accounts, 5);
    assert.ok(pts.every(p => p.balance === 150 + 200 - 50)); // 300 on every day
  });
});

test('getNetWorthHistory', async (t) => {
  const accounts = [{ id: 'a', initialBalance: 100 }, { id: 'b', initialBalance: 50 }];

  await t.test('returns `months` points with ascending dates', () => {
    const pts = SummaryEngine.getNetWorthHistory([], accounts, 6);
    assert.equal(pts.length, 6);
    for (const p of pts) {
      assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof p.balance, 'number');
    }
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i].date > pts[i - 1].date);
  });

  await t.test('with no transactions every snapshot equals total initial balance', () => {
    const pts = SummaryEngine.getNetWorthHistory([], accounts, 6);
    assert.ok(pts.every(p => p.balance === 150));
  });

  await t.test('includes transactions dated before every snapshot cutoff', () => {
    const txns = [{ type: 'income', accountId: 'a', amount: 80, date: daysAgo(730) }];
    const pts = SummaryEngine.getNetWorthHistory(txns, accounts, 6);
    assert.ok(pts.every(p => p.balance === 230)); // 150 + 80 on every snapshot
  });
});
