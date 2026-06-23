/* ============================================================
   Unit tests for the pure helpers in scripts/data/store.js:
   the CSV tokenizer (CSVService._parse) and the date/currency
   formatters. The store methods (TransactionStore, etc.) need a
   live Supabase client and are not unit-tested here.

   Run:  node --test tests/      (or: npm test)
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');

/* formatCurrency reads the chosen currency from localStorage; stub it
   before requiring the module so the formatter has something to read. */
let CURRENCY = 'CAD';
global.localStorage = { getItem: (k) => (k === 'pf_currency' ? CURRENCY : null) };

const { CSVService, isoLocal, formatCurrency, formatDate, formatDateShort } = require('../scripts/data/store.js');

/* ---- CSV tokenizer (the RFC-4180-ish parser) ---- */
test('CSVService._parse', async (t) => {
  await t.test('splits a simple grid of rows and cells', () => {
    assert.deepEqual(
      CSVService._parse('a,b,c\n1,2,3'),
      [['a', 'b', 'c'], ['1', '2', '3']],
    );
  });

  await t.test('keeps commas that live inside a quoted field', () => {
    assert.deepEqual(
      CSVService._parse('note,amount\n"Coffee, milk and sugar",4'),
      [['note', 'amount'], ['Coffee, milk and sugar', '4']],
    );
  });

  await t.test('unescapes a doubled quote ("") to a single quote', () => {
    assert.deepEqual(
      CSVService._parse('note\n"She said ""hi"""'),
      [['note'], ['She said "hi"']],
    );
  });

  await t.test('keeps a newline embedded in a quoted field', () => {
    assert.deepEqual(
      CSVService._parse('note\n"line one\nline two"'),
      [['note'], ['line one\nline two']],
    );
  });

  await t.test('handles CRLF line endings', () => {
    assert.deepEqual(
      CSVService._parse('a,b\r\n1,2\r\n'),
      [['a', 'b'], ['1', '2']],
    );
  });

  await t.test('a trailing newline does not create a spurious empty row', () => {
    assert.equal(CSVService._parse('a,b\n1,2\n').length, 2);
  });

  await t.test('preserves an empty cell between two commas', () => {
    assert.deepEqual(CSVService._parse('1,,3'), [['1', '', '3']]);
  });

  await t.test('empty input yields no rows', () => {
    assert.deepEqual(CSVService._parse(''), []);
  });

  await t.test('round-trips an export-shaped row with a quoted note + tags', () => {
    const csv =
      'date,type,amount,note,category,account,to_account,tags\n' +
      '2026-06-01,expense,12.50,"Lunch, downtown","Food","Main","","work;lunch"';
    const [header, row] = CSVService._parse(csv);
    assert.deepEqual(header, CSVService.HEADERS);
    assert.deepEqual(row, ['2026-06-01', 'expense', '12.50', 'Lunch, downtown', 'Food', 'Main', '', 'work;lunch']);
  });
});

/* ---- isoLocal: LOCAL calendar date (the UTC day-shift bug fix) ---- */
test('isoLocal', async (t) => {
  await t.test('reads the local calendar fields, never the UTC day', () => {
    // 23:30 local stays on the 9th — toISOString() would have rolled it to
    // the 10th for any timezone ahead of UTC. This is the bug isoLocal fixes.
    assert.equal(isoLocal(new Date(2026, 5, 9, 23, 30)), '2026-06-09');
    // ...and 00:30 local stays on the 9th for timezones behind UTC.
    assert.equal(isoLocal(new Date(2026, 5, 9, 0, 30)), '2026-06-09');
  });

  await t.test('zero-pads single-digit months and days', () => {
    assert.equal(isoLocal(new Date(2026, 0, 5)), '2026-01-05');
  });
});

/* ---- date formatters ---- */
test('formatDate / formatDateShort', async (t) => {
  await t.test('formats an ISO date with and without the year', () => {
    assert.equal(formatDate('2026-06-09'), 'Jun 9, 2026');
    assert.equal(formatDateShort('2026-06-09'), 'Jun 9');
  });

  await t.test('blank input yields an empty string', () => {
    assert.equal(formatDate(''), '');
    assert.equal(formatDateShort(null), '');
  });

  await t.test('parses at local midnight so the day never shifts', () => {
    // The +T00:00:00 suffix keeps "the 1st" rendering as the 1st, not the
    // last day of the prior month (the UTC day-shift bug this guards against).
    assert.equal(formatDate('2026-03-01'), 'Mar 1, 2026');
  });
});

/* ---- formatCurrency: the CAD `$` vs `CA$` symbol bug ---- */
test('formatCurrency', async (t) => {
  t.after(() => { CURRENCY = 'CAD'; });

  await t.test('CAD renders a bare $ (en-CA), not CA$', () => {
    CURRENCY = 'CAD';
    const s = formatCurrency(1234.5);
    assert.ok(s.includes('$'), `has a dollar sign: ${s}`);
    assert.ok(!s.includes('CA$'), `no CA$ prefix: ${s}`);
    assert.ok(s.includes('1,234.50'), `two decimals + grouping: ${s}`);
  });

  await t.test('uses the absolute value (sign handled elsewhere)', () => {
    CURRENCY = 'USD';
    assert.equal(formatCurrency(-50), formatCurrency(50));
  });

  await t.test('JPY shows no decimal places', () => {
    CURRENCY = 'JPY';
    const s = formatCurrency(1000);
    assert.ok(!s.includes('.'), `no decimal point for yen: ${s}`);
  });
});
