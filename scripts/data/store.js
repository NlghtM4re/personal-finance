/* ============================================================
   store.js — Data layer
   Uses backend API when FINTRACK_API is configured,
   falls back to localStorage for offline / local use.
   ============================================================ */

/* ---- Shared helpers ---- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function currentMonthRange() {
  const now  = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return { from, to: todayISO() };
}

/* ---- localStorage helpers (offline fallback) ---- */
const LS = {
  load(key)       { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  save(key, data) { localStorage.setItem(key, JSON.stringify(data)); },
};
const KEYS = { transactions: 'ft_transactions', accounts: 'ft_accounts', categories: 'ft_categories' };

/* ============================================================
   TRANSACTION STORE
   ============================================================ */
const TransactionStore = {

  async getAll() {
    if (API.isConfigured()) return API.get('/transactions');
    return LS.load(KEYS.transactions).sort((a, b) => b.date.localeCompare(a.date));
  },

  async getById(id) {
    if (API.isConfigured()) return API.get(`/transactions/${id}`);
    return LS.load(KEYS.transactions).find(t => t.id === id) || null;
  },

  async add(data) {
    if (API.isConfigured()) return API.post('/transactions', data);
    const tx = {
      id: uid(), date: data.date || todayISO(),
      amount: Math.abs(Number(data.amount)), type: data.type || 'expense',
      categoryId: data.categoryId || '', accountId: data.accountId || '',
      toAccountId: data.toAccountId || null, note: data.note || '',
      tags: data.tags || [], createdAt: new Date().toISOString(),
    };
    const all = LS.load(KEYS.transactions);
    all.push(tx);
    LS.save(KEYS.transactions, all);
    return tx;
  },

  async update(id, data) {
    if (API.isConfigured()) return API.put(`/transactions/${id}`, data);
    const all = LS.load(KEYS.transactions);
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, id, updatedAt: new Date().toISOString() };
    LS.save(KEYS.transactions, all);
    return all[idx];
  },

  async delete(id) {
    if (API.isConfigured()) return API.delete(`/transactions/${id}`);
    LS.save(KEYS.transactions, LS.load(KEYS.transactions).filter(t => t.id !== id));
  },

  async query({ from, to, categoryId, accountId, type, search } = {}) {
    if (API.isConfigured()) {
      const params = new URLSearchParams();
      if (from)       params.set('from', from);
      if (to)         params.set('to', to);
      if (categoryId) params.set('categoryId', categoryId);
      if (accountId)  params.set('accountId', accountId);
      if (type)       params.set('type', type);
      if (search)     params.set('search', search);
      return API.get(`/transactions?${params}`);
    }
    let list = LS.load(KEYS.transactions);
    if (from)       list = list.filter(t => t.date >= from);
    if (to)         list = list.filter(t => t.date <= to);
    if (categoryId) list = list.filter(t => t.categoryId === categoryId);
    if (accountId)  list = list.filter(t => t.accountId === accountId || t.toAccountId === accountId);
    if (type)       list = list.filter(t => t.type === type);
    if (search)     list = list.filter(t => t.note.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => b.date.localeCompare(a.date));
  },

  async thisMonth() {
    const { from, to } = currentMonthRange();
    return this.query({ from, to });
  },
};

/* ============================================================
   ACCOUNT STORE
   ============================================================ */
const AccountStore = {

  async getAll() {
    if (API.isConfigured()) return API.get('/accounts');
    return LS.load(KEYS.accounts);
  },

  async getById(id) {
    if (API.isConfigured()) return API.get(`/accounts/${id}`);
    return LS.load(KEYS.accounts).find(a => a.id === id) || null;
  },

  async add(data) {
    if (API.isConfigured()) return API.post('/accounts', data);
    const account = {
      id: uid(), name: data.name || 'Account', type: data.type || 'bank',
      initialBalance: Number(data.initialBalance) || 0, color: data.color || '#6366f1',
      createdAt: new Date().toISOString(),
    };
    const all = LS.load(KEYS.accounts);
    all.push(account);
    LS.save(KEYS.accounts, all);
    return account;
  },

  async update(id, data) {
    if (API.isConfigured()) return API.put(`/accounts/${id}`, data);
    const all = LS.load(KEYS.accounts);
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, id };
    LS.save(KEYS.accounts, all);
    return all[idx];
  },

  async delete(id) {
    if (API.isConfigured()) return API.delete(`/accounts/${id}`);
    LS.save(KEYS.accounts, LS.load(KEYS.accounts).filter(a => a.id !== id));
  },

  async getBalance(accountId) {
    if (API.isConfigured()) {
      const { balance } = await API.get(`/accounts/${accountId}/balance`);
      return balance;
    }
    const account = LS.load(KEYS.accounts).find(a => a.id === accountId);
    if (!account) return 0;
    const txs = LS.load(KEYS.transactions).filter(
      t => t.accountId === accountId || t.toAccountId === accountId
    );
    return txs.reduce((bal, t) => {
      if (t.type === 'income'   && t.accountId    === accountId) return bal + t.amount;
      if (t.type === 'expense'  && t.accountId    === accountId) return bal - t.amount;
      if (t.type === 'transfer' && t.accountId    === accountId) return bal - t.amount;
      if (t.type === 'transfer' && t.toAccountId  === accountId) return bal + t.amount;
      return bal;
    }, account.initialBalance);
  },

  async getTotalBalance() {
    const accounts = await this.getAll();
    const balances = await Promise.all(accounts.map(a => this.getBalance(a.id)));
    return balances.reduce((s, b) => s + b, 0);
  },
};

/* ============================================================
   CATEGORY STORE
   ============================================================ */
const DEFAULT_CATEGORIES = [
  { id: 'cat-salary',     name: 'Salary',      icon: '💼', type: 'income'  },
  { id: 'cat-freelance',  name: 'Freelance',   icon: '💻', type: 'income'  },
  { id: 'cat-gift',       name: 'Gift',        icon: '🎁', type: 'income'  },
  { id: 'cat-invest',     name: 'Investment',  icon: '📈', type: 'income'  },
  { id: 'cat-food',       name: 'Food',        icon: '🍔', type: 'expense' },
  { id: 'cat-rent',       name: 'Rent',        icon: '🏠', type: 'expense' },
  { id: 'cat-transport',  name: 'Transport',   icon: '🚗', type: 'expense' },
  { id: 'cat-health',     name: 'Health',      icon: '❤️', type: 'expense' },
  { id: 'cat-shopping',   name: 'Shopping',    icon: '🛍️', type: 'expense' },
  { id: 'cat-entertain',  name: 'Fun',         icon: '🎮', type: 'expense' },
  { id: 'cat-bills',      name: 'Bills',       icon: '⚡', type: 'expense' },
  { id: 'cat-education',  name: 'Education',   icon: '📚', type: 'expense' },
  { id: 'cat-travel',     name: 'Travel',      icon: '✈️', type: 'expense' },
  { id: 'cat-other',      name: 'Other',       icon: '📦', type: 'both'   },
];

const CategoryStore = {
  _cache: null,

  async getAll() {
    if (API.isConfigured()) {
      if (!this._cache) this._cache = await API.get('/categories');
      return this._cache;
    }
    const custom = LS.load(KEYS.categories);
    const merged = [...DEFAULT_CATEGORIES];
    custom.forEach(c => { if (!merged.find(d => d.id === c.id)) merged.push(c); });
    return merged;
  },

  async getById(id) {
    const all = await this.getAll();
    return all.find(c => c.id === id) || null;
  },

  async getByType(type) {
    const all = await this.getAll();
    return all.filter(c => c.type === type || c.type === 'both');
  },

  invalidateCache() { this._cache = null; },
};

/* ============================================================
   FORMAT HELPERS
   ============================================================ */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateShort(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

/* Toast notification */
function showToast(message, type = '') {
  const container = document.getElementById('toastContainer') || (() => {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();
  const toast = document.createElement('div');
  toast.className = `toast${type ? ' toast--' + type : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
