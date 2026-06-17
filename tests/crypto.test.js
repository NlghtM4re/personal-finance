/* ============================================================
   Unit tests for CryptoBalances (scripts/data/crypto.js).
   Covers the security-critical address validators and the
   network retry helper. Pure logic + a mocked global fetch.

   Run:  node --test tests/      (or: npm test)
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const { CryptoBalances } = require('../scripts/data/crypto.js');

/* A few real, valid public addresses (format-correct, not secrets). */
const VALID = {
  btcBech32: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  btcLegacy: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  sol:       '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
};

test('looksSecret refuses keys/seeds', async (t) => {
  await t.test('flags a 12-word mnemonic', () => {
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    assert.equal(CryptoBalances.looksSecret(seed), 'seed phrase');
  });

  await t.test('flags a 64-char hex private key (with or without 0x)', () => {
    assert.equal(CryptoBalances.looksSecret('a'.repeat(64)), 'private key');
    assert.equal(CryptoBalances.looksSecret('0x' + 'a'.repeat(64)), 'private key');
  });

  await t.test('flags a BTC WIF private key', () => {
    assert.equal(CryptoBalances.looksSecret('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ'), 'private key');
  });

  await t.test('flags a long base58 SOL secret key', () => {
    assert.equal(CryptoBalances.looksSecret('A'.repeat(88)), 'private key');
  });

  await t.test('does NOT flag normal public addresses, returns null', () => {
    assert.equal(CryptoBalances.looksSecret(VALID.btcBech32), null);
    assert.equal(CryptoBalances.looksSecret(VALID.btcLegacy), null);
    assert.equal(CryptoBalances.looksSecret(VALID.sol), null);
    assert.equal(CryptoBalances.looksSecret(''), null);
  });
});

test('validateAddress', async (t) => {
  await t.test('accepts valid BTC addresses', () => {
    assert.deepEqual(CryptoBalances.validateAddress('btc', VALID.btcBech32), { ok: true, value: VALID.btcBech32 });
    assert.deepEqual(CryptoBalances.validateAddress('btc', VALID.btcLegacy), { ok: true, value: VALID.btcLegacy });
  });

  await t.test('accepts a valid SOL address', () => {
    assert.deepEqual(CryptoBalances.validateAddress('sol', VALID.sol), { ok: true, value: VALID.sol });
  });

  await t.test('trims surrounding whitespace', () => {
    assert.deepEqual(CryptoBalances.validateAddress('btc', `  ${VALID.btcBech32}  `), { ok: true, value: VALID.btcBech32 });
  });

  await t.test('rejects a pasted secret with a key/seed warning', () => {
    const r = CryptoBalances.validateAddress('btc', 'a'.repeat(64));
    assert.equal(r.ok, false);
    assert.match(r.error, /private key/);
    assert.match(r.error, /PUBLIC/);
  });

  await t.test('rejects empty input and malformed addresses', () => {
    assert.equal(CryptoBalances.validateAddress('btc', '').ok, false);
    assert.equal(CryptoBalances.validateAddress('btc', 'not-an-address').ok, false);
    assert.equal(CryptoBalances.validateAddress('sol', '!!!').ok, false);
  });

  await t.test('rejects an unsupported chain', () => {
    assert.equal(CryptoBalances.validateAddress('doge', VALID.btcLegacy).ok, false);
  });
});

/* ---- network retry helper ---- */
function mockFetch(steps) {
  let i = 0;
  const fn = async () => {
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    if (step.throw) throw new Error(step.throw);
    return { ok: step.status >= 200 && step.status < 300, status: step.status };
  };
  fn.count = () => i;
  return fn;
}

test('_fetch retry helper', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const opts = { delay: 0, timeout: 1000 }; // no backoff wait in tests

  await t.test('returns immediately on first success (one call)', async () => {
    global.fetch = mockFetch([{ status: 200 }]);
    const r = await CryptoBalances._fetch('http://x', {}, opts);
    assert.equal(r.ok, true);
    assert.equal(global.fetch.count(), 1);
  });

  await t.test('retries a thrown network error, then succeeds', async () => {
    global.fetch = mockFetch([{ throw: 'network down' }, { throw: 'still down' }, { status: 200 }]);
    const r = await CryptoBalances._fetch('http://x', {}, opts);
    assert.equal(r.ok, true);
    assert.equal(global.fetch.count(), 3);
  });

  await t.test('retries 5xx and 429 but not other 4xx', async () => {
    global.fetch = mockFetch([{ status: 503 }, { status: 200 }]);
    assert.equal((await CryptoBalances._fetch('http://x', {}, opts)).ok, true);
    assert.equal(global.fetch.count(), 2);

    global.fetch = mockFetch([{ status: 429 }, { status: 200 }]);
    assert.equal((await CryptoBalances._fetch('http://x', {}, opts)).ok, true);
    assert.equal(global.fetch.count(), 2);

    // 404 is a definitive answer — hand it back without retrying
    global.fetch = mockFetch([{ status: 404 }, { status: 200 }]);
    const r = await CryptoBalances._fetch('http://x', {}, opts);
    assert.equal(r.status, 404);
    assert.equal(global.fetch.count(), 1);
  });

  await t.test('throws after exhausting all tries', async () => {
    global.fetch = mockFetch([{ throw: 'down' }]);
    await assert.rejects(
      () => CryptoBalances._fetch('http://x', {}, { ...opts, tries: 3 }),
      /down/,
    );
    assert.equal(global.fetch.count(), 3);
  });
});
