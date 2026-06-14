/* ============================================================
   crypto.js — Read-only crypto wallet balances.

   SECURITY MODEL — read this before changing anything:
   - Viewing a balance needs only the PUBLIC address. This file
     never accepts, stores, or transmits a private key or seed
     phrase, and never signs or sends a transaction.
   - validateAddress() actively REJECTS anything that looks like
     a secret (mnemonic / private key / WIF) so a user can't paste
     one by mistake.
   - Storage is localStorage (public addresses only). Worst case
     of a leak is a privacy cost, never loss of funds.

   Data sources (all keyless, CORS-friendly — verified):
   - BTC:    https://blockstream.info/api/address/{addr}
   - SOL:    https://solana-rpc.publicnode.com  (getBalance)
   - Prices: https://api.coingecko.com/api/v3/simple/price
   ============================================================ */

const CHAINS = {
  btc: { id: 'btc', label: 'Bitcoin', symbol: 'BTC', coingecko: 'bitcoin', decimals: 8, color: '#f7931a' },
  sol: { id: 'sol', label: 'Solana',  symbol: 'SOL', coingecko: 'solana',  decimals: 9, color: '#14f195' },
};

const CryptoBalances = {

  /* ---- secret detection: returns a human label if the input looks
     like a key/seed, else null. Used to refuse dangerous input. ---- */
  looksSecret(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    const words = s.split(/\s+/);
    if (words.length >= 12 && words.every(w => /^[a-zA-Z]+$/.test(w))) return 'seed phrase';
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return 'private key';
    if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s)) return 'private key';        // BTC WIF
    if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s)) return 'private key';             // SOL secret key (base58)
    return null;
  },

  /* ---- per-chain public-address validation ---- */
  validateAddress(chain, addr) {
    const s = String(addr || '').trim();
    if (!s) return { ok: false, error: 'Enter a public address.' };
    const secret = this.looksSecret(s);
    if (secret) {
      return { ok: false, error: `That looks like a ${secret}. Never paste that here — only your PUBLIC receive address.` };
    }
    if (chain === 'btc') {
      if (/^bc1[0-9a-z]{20,87}$/i.test(s) || /^[13][1-9A-HJ-NP-Za-km-z]{25,39}$/.test(s)) return { ok: true, value: s };
      return { ok: false, error: 'That is not a valid Bitcoin address.' };
    }
    if (chain === 'sol') {
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return { ok: true, value: s };
      return { ok: false, error: 'That is not a valid Solana address.' };
    }
    return { ok: false, error: 'Unsupported chain.' };
  },

  /* ---- balance per address (in whole coins) ---- */
  async fetchBtcAddress(addr) {
    const r = await fetch(`https://blockstream.info/api/address/${encodeURIComponent(addr)}`);
    if (!r.ok) throw new Error('Bitcoin lookup failed');
    const j = await r.json();
    const c = j.chain_stats, m = j.mempool_stats;
    const sats = (c.funded_txo_sum - c.spent_txo_sum) + (m.funded_txo_sum - m.spent_txo_sum);
    return sats / 1e8;
  },

  async fetchSolAddress(addr) {
    const r = await fetch('https://solana-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }),
    });
    if (!r.ok) throw new Error('Solana lookup failed');
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'Solana lookup failed');
    return (j.result?.value ?? 0) / 1e9;
  },

  fetchAddress(chain, addr) {
    if (chain === 'btc') return this.fetchBtcAddress(addr);
    if (chain === 'sol') return this.fetchSolAddress(addr);
    return Promise.reject(new Error('Unsupported chain'));
  },

  /* total coin amount across all of a wallet's addresses */
  async walletAmount(wallet) {
    const amounts = await Promise.all((wallet.addresses || []).map(a => this.fetchAddress(wallet.chain, a)));
    return amounts.reduce((s, x) => s + x, 0);
  },

  /* ---- spot prices in the user's currency (falls back to USD) ---- */
  async prices() {
    let cur = (localStorage.getItem('pf_currency') || 'CAD').toLowerCase();
    const ids = Object.values(CHAINS).map(c => c.coingecko).join(',');
    const fetchFor = async (vs) => {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}`);
      if (!r.ok) throw new Error('Price lookup failed');
      return r.json();
    };
    let j = await fetchFor(cur);
    if (Object.values(CHAINS).every(c => j[c.coingecko]?.[cur] == null)) { cur = 'usd'; j = await fetchFor(cur); }
    const map = {};
    for (const c of Object.values(CHAINS)) map[c.id] = j[c.coingecko]?.[cur] ?? null;
    return { currency: cur.toUpperCase(), map };
  },
};

/* ============================================================
   CRYPTO STORE — localStorage. Public addresses only.
   Wallet: { id, label, chain, addresses: string[] }
   ============================================================ */
const CryptoStore = {
  _key: 'pf_crypto_wallets',

  _all() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]'); }
    catch { return []; }
  },
  _persist(list) { localStorage.setItem(this._key, JSON.stringify(list)); },

  getAll() { return this._all(); },

  add({ label, chain, addresses }) {
    const list = this._all();
    const wallet = {
      id: 'cw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label: (label || '').trim() || CHAINS[chain]?.label || 'Wallet',
      chain,
      addresses: (addresses || []).filter(Boolean),
    };
    list.push(wallet);
    this._persist(list);
    return wallet;
  },

  addAddress(id, addr) {
    const list = this._all();
    const w = list.find(x => x.id === id);
    if (w && !w.addresses.includes(addr)) { w.addresses.push(addr); this._persist(list); }
    return w;
  },

  remove(id) { this._persist(this._all().filter(w => w.id !== id)); },
};
