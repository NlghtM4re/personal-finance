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

  /* ---- spot price + 24h change + 7-day sparkline, in the user's
     currency (falls back to USD). One CoinGecko call. ---- */
  async prices() {
    let cur = (localStorage.getItem('pf_currency') || 'CAD').toLowerCase();
    const ids = Object.values(CHAINS).map(c => c.coingecko).join(',');
    const fetchFor = async (vs) => {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&ids=${ids}&sparkline=true&price_change_percentage=24h`);
      if (!r.ok) throw new Error('Price lookup failed');
      return r.json();
    };
    let arr = await fetchFor(cur);
    if (!Array.isArray(arr) || !arr.length) { cur = 'usd'; arr = await fetchFor(cur); }
    const byGecko = {};
    (Array.isArray(arr) ? arr : []).forEach(c => { byGecko[c.id] = c; });
    const map = {};
    for (const c of Object.values(CHAINS)) {
      const d = byGecko[c.coingecko];
      map[c.id] = {
        price:     d?.current_price ?? null,
        change24h: d?.price_change_percentage_24h ?? null,
        sparkline: d?.sparkline_in_7d?.price || [],
      };
    }
    return { currency: cur.toUpperCase(), map };
  },

  /* ---- one-shot holdings snapshot: per-wallet amount + fiat + total.
     Shared by the Crypto page, the dashboard, and the accounts net
     worth. Pass `wallets` to skip the store round-trip. ---- */
  async snapshot(wallets) {
    wallets = wallets || await CryptoStore.getAll();
    const fallbackCur = (localStorage.getItem('pf_currency') || 'CAD').toUpperCase();
    if (!wallets.length) return { wallets: [], items: [], total: 0, currency: fallbackCur, anyMissing: false };

    let prices;
    try { prices = await this.prices(); }
    catch { prices = { currency: fallbackCur, map: {} }; }

    const items = await Promise.all(wallets.map(async (w) => {
      try {
        const amount = await this.walletAmount(w);
        const p      = prices.map[w.chain] || {};
        const fiat   = p.price != null ? amount * p.price : null;
        return { wallet: w, amount, fiat, change24h: p.change24h ?? null, sparkline: p.sparkline || [], error: null };
      } catch (e) {
        return { wallet: w, amount: null, fiat: null, change24h: null, sparkline: [], error: e.message || 'Lookup failed' };
      }
    }));

    return {
      wallets, items,
      total: items.reduce((s, x) => s + (x.fiat || 0), 0),
      currency: prices.currency,
      anyMissing: items.some(x => x.fiat == null),
    };
  },
};

/* ============================================================
   CRYPTO STORE — Supabase table `crypto_wallets`, syncing across
   devices. Falls back to localStorage until the table exists
   (run supabase-schema.sql), then migrates local wallets into it
   on first load. Public addresses only — never keys/seeds.
   Wallet: { id, label, chain, addresses: string[] }
   ============================================================ */
const CryptoStore = {
  _key: 'pf_crypto_wallets',
  _mode: null,

  _local() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]'); }
    catch { return []; }
  },
  _persistLocal(list) { localStorage.setItem(this._key, JSON.stringify(list)); },

  _normalize(w) {
    return { id: w.id, label: w.label, chain: w.chain, addresses: Array.isArray(w.addresses) ? w.addresses : [] };
  },

  async _detect() {
    if (this._mode) return this._mode;
    const { error } = await sb.from('crypto_wallets').select('id').limit(1);
    this._mode = error ? 'local' : 'table';
    if (this._mode === 'table') await this._migrate();
    return this._mode;
  },

  async _migrate() {
    try {
      const legacy = this._local();
      if (!legacy.length) return;
      const uid = await userId();
      if (!uid) return;
      const rows = legacy.map(w => ({ user_id: uid, label: w.label, chain: w.chain, addresses: w.addresses || [] }));
      const { error } = await sb.from('crypto_wallets').insert(rows);
      if (!error) this._persistLocal([]);
    } catch (_) { /* local data stays until the next successful load */ }
  },

  async getAll() {
    if (await this._detect() === 'local') return this._local().map(w => this._normalize(w));
    const { data, error } = await sb.from('crypto_wallets').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data || []).map(w => this._normalize(w));
  },

  async add({ label, chain, addresses }) {
    const wallet = {
      label: (label || '').trim() || CHAINS[chain]?.label || 'Wallet',
      chain,
      addresses: (addresses || []).filter(Boolean),
    };
    if (await this._detect() === 'local') {
      const list = this._local();
      wallet.id = 'cw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      list.push(wallet);
      this._persistLocal(list);
      return wallet;
    }
    const uid = await userId();
    const { data, error } = await sb.from('crypto_wallets').insert({ user_id: uid, ...wallet }).select().single();
    if (error) throw new Error(error.message);
    return this._normalize(data);
  },

  async addAddress(id, addr) {
    const wallets = await this.getAll();
    const w = wallets.find(x => x.id === id);
    if (!w || w.addresses.includes(addr)) return w;
    const addresses = [...w.addresses, addr];
    if (await this._detect() === 'local') {
      const list = this._local();
      const lw = list.find(x => x.id === id);
      if (lw) { lw.addresses = addresses; this._persistLocal(list); }
      return lw && this._normalize(lw);
    }
    const { error } = await sb.from('crypto_wallets').update({ addresses }).eq('id', id);
    if (error) throw new Error(error.message);
    return { ...w, addresses };
  },

  async remove(id) {
    if (await this._detect() === 'local') {
      this._persistLocal(this._local().filter(w => w.id !== id));
      return;
    }
    const { error } = await sb.from('crypto_wallets').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
