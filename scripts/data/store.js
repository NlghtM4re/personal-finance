/* ============================================================
   store.js — localStorage CRUD for all data entities
   ============================================================ */

const KEYS = {
  transactions: 'ft_transactions',
  accounts:     'ft_accounts',
  categories:   'ft_categories',
};

/* --- Helpers --- */
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============================================================
   TRANSACTIONS
   ============================================================ */
const TransactionStore = {
  getAll() {
    return load(KEYS.transactions);
  },

  getById(id) {
    return this.getAll().find(t => t.id === id) || null;
  },

  add(data) {
    const tx = {
      id:          uid(),
      date:        data.date        || new Date().toISOString().slice(0, 10),
      amount:      Math.abs(Number(data.amount)),
      type:        data.type        || 'expense',
      categoryId:  data.categoryId  || '',
      accountId:   data.accountId   || '',
      toAccountId: data.toAccountId || null,
      note:        data.note        || '',
      tags:        data.tags        || [],
      createdAt:   new Date().toISOString(),
    };
    const all = this.getAll();
    all.push(tx);
    save(KEYS.transactions, all);
    return tx;
  },

  update(id, data) {
    const all = this.getAll();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, id, updatedAt: new Date().toISOString() };
    save(KEYS.transactions, all);
    return all[idx];
  },

  delete(id) {
    const all = this.getAll().filter(t => t.id !== id);
    save(KEYS.transactions, all);
  },

  /* Filter helpers */
  query({ from, to, categoryId, accountId, type, search } = {}) {
    let list = this.getAll();
    if (from)       list = list.filter(t => t.date >= from);
    if (to)         list = list.filter(t => t.date <= to);
    if (categoryId) list = list.filter(t => t.categoryId === categoryId);
    if (accountId)  list = list.filter(t => t.accountId === accountId || t.toAccountId === accountId);
    if (type)       list = list.filter(t => t.type === type);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.note.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  },

  thisMonth() {
    const now  = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const to   = new Date().toISOString().slice(0, 10);
    return this.query({ from, to });
  },
};

/* ============================================================
   ACCOUNTS
   ============================================================ */
const AccountStore = {
  getAll() {
    return load(KEYS.accounts);
  },

  getById(id) {
    return this.getAll().find(a => a.id === id) || null;
  },

  add(data) {
    const account = {
      id:             uid(),
      name:           data.name           || 'Account',
      type:           data.type           || 'bank',
      initialBalance: Number(data.initialBalance) || 0,
      color:          data.color          || '#6366f1',
      createdAt:      new Date().toISOString(),
    };
    const all = this.getAll();
    all.push(account);
    save(KEYS.accounts, all);
    return account;
  },

  update(id, data) {
    const all = this.getAll();
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, id };
    save(KEYS.accounts, all);
    return all[idx];
  },

  delete(id) {
    const all = this.getAll().filter(a => a.id !== id);
    save(KEYS.accounts, all);
  },

  getBalance(accountId) {
    const account = this.getById(accountId);
    if (!account) return 0;
    const txs = TransactionStore.getAll().filter(
      t => t.accountId === accountId || t.toAccountId === accountId
    );
    return txs.reduce((bal, t) => {
      if (t.type === 'income'   && t.accountId === accountId) return bal + t.amount;
      if (t.type === 'expense'  && t.accountId === accountId) return bal - t.amount;
      if (t.type === 'transfer' && t.accountId === accountId) return bal - t.amount;
      if (t.type === 'transfer' && t.toAccountId === accountId) return bal + t.amount;
      return bal;
    }, account.initialBalance);
  },

  getTotalBalance() {
    return this.getAll().reduce((sum, a) => sum + this.getBalance(a.id), 0);
  },
};

/* ============================================================
   CATEGORIES
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
  getAll() {
    const custom = load(KEYS.categories);
    const merged = [...DEFAULT_CATEGORIES];
    custom.forEach(c => {
      if (!merged.find(d => d.id === c.id)) merged.push(c);
    });
    return merged;
  },

  getById(id) {
    return this.getAll().find(c => c.id === id) || null;
  },

  getByType(type) {
    return this.getAll().filter(c => c.type === type || c.type === 'both');
  },

  addCustom(data) {
    const custom = load(KEYS.categories);
    const cat = {
      id:   uid(),
      name: data.name || 'Custom',
      icon: data.icon || '📦',
      type: data.type || 'expense',
    };
    custom.push(cat);
    save(KEYS.categories, custom);
    return cat;
  },
};

/* ============================================================
   FORMAT HELPERS (shared across pages)
   ============================================================ */
function formatCurrency(amount, sign = '') {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
  return sign + formatted;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthRange() {
  const now  = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to   = todayISO();
  return { from, to };
}

/* Toast utility */
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
