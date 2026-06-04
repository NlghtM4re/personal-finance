/* ============================================================
   store.js — Data layer (Supabase)
   ============================================================ */

/* ---- Helpers ---- */
function todayISO() { return new Date().toISOString().slice(0, 10); }

function currentMonthRange() {
  const now  = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return { from, to: todayISO() };
}

async function userId() {
  const user = await SupaAuth.getUser();
  return user?.id;
}

/* ---- camelCase mappers ---- */
function accountToCamel(r) {
  return {
    id:             r.id,
    name:           r.name,
    type:           r.type,
    initialBalance: Number(r.initial_balance),
    color:          r.color,
    createdAt:      r.created_at,
  };
}

function txToCamel(r) {
  return {
    id:          r.id,
    date:        r.date,
    amount:      Number(r.amount),
    type:        r.type,
    categoryId:  r.category_id,
    accountId:   r.account_id,
    toAccountId: r.to_account_id,
    note:        r.note,
    tags:        r.tags || [],
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

/* ============================================================
   TRANSACTION STORE
   ============================================================ */
const TransactionStore = {

  async getAll() {
    const { data, error } = await sb.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(txToCamel);
  },

  async getById(id) {
    const { data, error } = await sb.from('transactions').select('*').eq('id', id).single();
    if (error) return null;
    return txToCamel(data);
  },

  async add(data) {
    const uid = await userId();
    const { data: row, error } = await sb.from('transactions').insert({
      user_id:       uid,
      date:          data.date || todayISO(),
      amount:        Math.abs(Number(data.amount)),
      type:          data.type || 'expense',
      category_id:   data.categoryId  || null,
      account_id:    data.accountId   || null,
      to_account_id: data.toAccountId || null,
      note:          data.note        || '',
      tags:          data.tags        || [],
    }).select().single();
    if (error) throw new Error(error.message);
    return txToCamel(row);
  },

  async update(id, data) {
    const patch = {};
    if (data.date        !== undefined) patch.date          = data.date;
    if (data.amount      !== undefined) patch.amount        = Math.abs(Number(data.amount));
    if (data.type        !== undefined) patch.type          = data.type;
    if (data.categoryId  !== undefined) patch.category_id   = data.categoryId;
    if (data.accountId   !== undefined) patch.account_id    = data.accountId;
    if (data.toAccountId !== undefined) patch.to_account_id = data.toAccountId;
    if (data.note        !== undefined) patch.note          = data.note;
    if (data.tags        !== undefined) patch.tags          = data.tags;
    patch.updated_at = new Date().toISOString();

    const { data: row, error } = await sb.from('transactions').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return txToCamel(row);
  },

  async delete(id) {
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async query({ from, to, categoryId, accountId, type, search } = {}) {
    let q = sb.from('transactions').select('*');
    if (from)       q = q.gte('date', from);
    if (to)         q = q.lte('date', to);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (accountId)  q = q.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
    if (type)       q = q.eq('type', type);
    if (search)     q = q.ilike('note', `%${search}%`);
    q = q.order('date', { ascending: false }).order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map(txToCamel);
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
    const { data, error } = await sb.from('accounts').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data || []).map(accountToCamel);
  },

  async getById(id) {
    const { data, error } = await sb.from('accounts').select('*').eq('id', id).single();
    if (error) return null;
    return accountToCamel(data);
  },

  async add(data) {
    const uid = await userId();
    const { data: row, error } = await sb.from('accounts').insert({
      user_id:         uid,
      name:            data.name || 'Account',
      type:            data.type || 'bank',
      initial_balance: Number(data.initialBalance) || 0,
      color:           data.color || '#6366f1',
    }).select().single();
    if (error) throw new Error(error.message);
    return accountToCamel(row);
  },

  async update(id, data) {
    const patch = {};
    if (data.name            !== undefined) patch.name            = data.name;
    if (data.type            !== undefined) patch.type            = data.type;
    if (data.initialBalance  !== undefined) patch.initial_balance = Number(data.initialBalance);
    if (data.color           !== undefined) patch.color           = data.color;
    const { data: row, error } = await sb.from('accounts').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return accountToCamel(row);
  },

  async delete(id) {
    const { error } = await sb.from('accounts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getBalance(accountId) {
    const account = await this.getById(accountId);
    if (!account) return 0;
    const { data: txs, error } = await sb.from('transactions').select('type, amount, account_id, to_account_id').or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
    if (error) return account.initialBalance;
    return (txs || []).reduce((bal, t) => {
      if (t.type === 'income'   && t.account_id    === accountId) return bal + Number(t.amount);
      if (t.type === 'expense'  && t.account_id    === accountId) return bal - Number(t.amount);
      if (t.type === 'transfer' && t.account_id    === accountId) return bal - Number(t.amount);
      if (t.type === 'transfer' && t.to_account_id === accountId) return bal + Number(t.amount);
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
   CATEGORY STORE (hardcoded defaults, no DB)
   ============================================================ */
const DEFAULT_CATEGORIES = [
  { id: 'cat-salary',    name: 'Salary',     icon: '💼', type: 'income'  },
  { id: 'cat-freelance', name: 'Freelance',  icon: '💻', type: 'income'  },
  { id: 'cat-gift',      name: 'Gift',       icon: '🎁', type: 'income'  },
  { id: 'cat-invest',    name: 'Investment', icon: '📈', type: 'income'  },
  { id: 'cat-food',      name: 'Food',       icon: '🍔', type: 'expense' },
  { id: 'cat-rent',      name: 'Rent',       icon: '🏠', type: 'expense' },
  { id: 'cat-transport', name: 'Transport',  icon: '🚗', type: 'expense' },
  { id: 'cat-health',    name: 'Health',     icon: '❤️', type: 'expense' },
  { id: 'cat-shopping',  name: 'Shopping',   icon: '🛍️', type: 'expense' },
  { id: 'cat-entertain', name: 'Fun',        icon: '🎮', type: 'expense' },
  { id: 'cat-bills',     name: 'Bills',      icon: '⚡', type: 'expense' },
  { id: 'cat-education', name: 'Education',  icon: '📚', type: 'expense' },
  { id: 'cat-travel',    name: 'Travel',     icon: '✈️', type: 'expense' },
  { id: 'cat-other',     name: 'Other',      icon: '📦', type: 'both'   },
];

const CategoryStore = {
  async getAll()        { return DEFAULT_CATEGORIES; },
  async getById(id)     { return DEFAULT_CATEGORIES.find(c => c.id === id) || null; },
  async getByType(type) { return DEFAULT_CATEGORIES.filter(c => c.type === type || c.type === 'both'); },
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
