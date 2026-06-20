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
    /* NB: don't write `updated_at` — it's unused by the app and absent from
       older DBs (the schema uses `create table if not exists`, so the column
       was never added to tables created before it). Setting it made every
       edit fail with "column updated_at does not exist" while creates (which
       never set it) worked. */

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

  /* Default account for new transactions (local convenience — prefills the
     Add Transaction form and the dashboard quick-log). '' = no preference. */
  getDefaultId() { return localStorage.getItem('pf_default_account') || ''; },
  setDefaultId(id) {
    if (id) localStorage.setItem('pf_default_account', id);
    else localStorage.removeItem('pf_default_account');
  },

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
  { id: 'cat-salary',    name: 'Salary',           icon: '💼', type: 'income'  },
  { id: 'cat-freelance', name: 'Freelance',        icon: '💻', type: 'income'  },
  { id: 'cat-bonus',     name: 'Bonus',            icon: '💰', type: 'income'  },
  { id: 'cat-refund',    name: 'Refund',           icon: '💸', type: 'income'  },
  { id: 'cat-gift',      name: 'Gift',             icon: '🎁', type: 'income'  },
  { id: 'cat-invest',    name: 'Investment',       icon: '📈', type: 'income'  },
  { id: 'cat-food',      name: 'Restaurants',      icon: '🍔', type: 'expense' },
  { id: 'cat-groceries', name: 'Groceries',        icon: '🛒', type: 'expense' },
  { id: 'cat-rent',      name: 'Rent',             icon: '🏠', type: 'expense' },
  { id: 'cat-bills',     name: 'Bills',            icon: '⚡', type: 'expense' },
  { id: 'cat-subs',      name: 'Subscriptions',    icon: '📺', type: 'expense' },
  { id: 'cat-transport', name: 'Transport',        icon: '🚗', type: 'expense' },
  { id: 'cat-health',    name: 'Health',           icon: '❤️', type: 'expense' },
  { id: 'cat-fitness',   name: 'Sports & Fitness', icon: '🏋️', type: 'expense' },
  { id: 'cat-care',      name: 'Personal Care',    icon: '💈', type: 'expense' },
  { id: 'cat-shopping',  name: 'Shopping',         icon: '🛍️', type: 'expense' },
  { id: 'cat-entertain', name: 'Entertainment',    icon: '🎮', type: 'expense' },
  { id: 'cat-pets',      name: 'Pets',             icon: '🐾', type: 'expense' },
  { id: 'cat-insurance', name: 'Insurance',        icon: '🛡️', type: 'expense' },
  { id: 'cat-taxes',     name: 'Taxes',            icon: '🧾', type: 'expense' },
  { id: 'cat-donations', name: 'Gifts & Donations', icon: '💝', type: 'expense' },
  { id: 'cat-education', name: 'Education',        icon: '📚', type: 'expense' },
  { id: 'cat-travel',    name: 'Travel',           icon: '✈️', type: 'expense' },
  { id: 'cat-other',     name: 'Other',            icon: '📦', type: 'both'   },
];

const CategoryStore = {
  async getAll() {
    const custom = await SettingsStore.getCustomCategories();
    return [...DEFAULT_CATEGORIES, ...custom];
  },
  async getById(id) {
    const all = await this.getAll();
    return all.find(c => c.id === id) || null;
  },
  async getByType(type) {
    const all = await this.getAll();
    return all.filter(c => c.type === type || c.type === 'both');
  },
};

/* ============================================================
   SETTINGS STORE (Supabase — all user preferences)
   ============================================================ */
const SettingsStore = {
  _cache: null,

  _defaults() {
    return { currency: 'CAD', budgets: {}, custom_categories: [], subscriptions: [] };
  },

  async _load() {
    if (this._cache) return this._cache;
    const uid = await userId();
    if (!uid) return this._defaults();
    const { data } = await sb.from('user_settings').select('*').eq('user_id', uid).maybeSingle();
    this._cache = data ? { ...this._defaults(), ...data } : this._defaults();
    /* keep the synchronous formatCurrency cache in step with the server value */
    if (data && data.currency) localStorage.setItem('pf_currency', data.currency);
    return this._cache;
  },

  _invalidate() { this._cache = null; },

  async _save(patch) {
    const uid = await userId();
    if (!uid) return;
    /* ensure cache is fully loaded before merging to avoid clobbering fields */
    if (!this._cache) await this._load();
    this._cache = { ...this._cache, ...patch };
    await sb.from('user_settings').upsert({ user_id: uid, ...this._cache }, { onConflict: 'user_id' });
  },

  async getCurrency() {
    const cached = localStorage.getItem('pf_currency');
    if (cached) return cached;
    const s = await this._load();
    const c = s.currency || 'CAD';
    localStorage.setItem('pf_currency', c);
    return c;
  },

  async setCurrency(currency) {
    localStorage.setItem('pf_currency', currency);
    await this._save({ currency });
  },

  async getCustomCategories() {
    const s = await this._load();
    return Array.isArray(s.custom_categories) ? s.custom_categories : [];
  },

  async setCustomCategories(cats) {
    await this._save({ custom_categories: cats });
  },

  async getBudgets() {
    const s = await this._load();
    const budgets = s.budgets || {};
    localStorage.setItem('pf_budgets', JSON.stringify(budgets));
    return budgets;
  },

  async setBudgets(budgets) {
    localStorage.setItem('pf_budgets', JSON.stringify(budgets));
    await this._save({ budgets });
  },

  async getSubscriptions() {
    const s = await this._load();
    return Array.isArray(s.subscriptions) ? s.subscriptions : [];
  },

  async setSubscriptions(subs) {
    if (this._cache) this._cache.subscriptions = subs;
    await this._save({ subscriptions: subs });
  },
};

/* ============================================================
   BUDGET STORE (syncs to Supabase via SettingsStore)
   ============================================================ */
const BudgetStore = {
  _key: 'pf_budgets',

  _all() {
    try { return JSON.parse(localStorage.getItem(this._key) || '{}'); }
    catch { return {}; }
  },

  async load() {
    return SettingsStore.getBudgets();
  },

  getMonth(monthKey) { return this._all()[monthKey] || {}; },

  async set(monthKey, categoryId, limit) {
    const all = this._all();
    if (!all[monthKey]) all[monthKey] = {};
    if (!limit || limit <= 0) delete all[monthKey][categoryId];
    else all[monthKey][categoryId] = Number(limit);
    await SettingsStore.setBudgets(all);
  },

  async copyFromPrevious(monthKey) {
    const all  = this._all();
    const d    = new Date(monthKey + '-01T00:00:00');
    d.setMonth(d.getMonth() - 1);
    const prev = d.toISOString().slice(0, 7);
    all[monthKey] = { ...(all[prev] || {}) };
    await SettingsStore.setBudgets(all);
    return all[monthKey];
  },
};

/* ============================================================
   SHARED ID / DATE HELPERS (used by SubscriptionStore)
   ============================================================ */
const IS_UUID = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');
function newUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function advanceDate(iso, frequency) {
  const d = new Date(iso + 'T00:00:00');
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

/* ============================================================
   SUBSCRIPTION STORE — Supabase table `subscriptions`.
   Table-first, with a legacy user_settings jsonb-blob fallback
   and lazy migration into the table once it exists.
   ============================================================ */
function subToCamel(r) {
  return {
    id: r.id, name: r.name, amount: Number(r.amount), frequency: r.frequency,
    nextDue: r.next_due, accountId: r.account_id, categoryId: r.category_id,
    color: r.color, autoLog: r.auto_log, active: r.active, createdAt: r.created_at,
  };
}

function subToRow(s) {
  const row = {};
  if (s.name       !== undefined) row.name        = s.name;
  if (s.amount     !== undefined) row.amount      = s.amount;
  if (s.frequency  !== undefined) row.frequency   = s.frequency;
  if (s.nextDue    !== undefined) row.next_due    = s.nextDue;
  if (s.accountId  !== undefined) row.account_id  = s.accountId  || null;
  if (s.categoryId !== undefined) row.category_id = s.categoryId || null;
  if (s.color      !== undefined) row.color       = s.color || null;
  if (s.autoLog    !== undefined) row.auto_log    = s.autoLog !== false;
  if (s.active     !== undefined) row.active      = s.active !== false;
  return row;
}

const SubscriptionStore = {
  _mode: null,

  async _detect() {
    if (this._mode) return this._mode;
    const { error } = await sb.from('subscriptions').select('id').limit(1);
    this._mode = error ? 'legacy' : 'table';
    if (this._mode === 'table') await this._migrate();
    return this._mode;
  },

  async _migrate() {
    try {
      const legacy = await SettingsStore.getSubscriptions();
      if (!legacy.length) return;
      const uid = await userId();
      if (!uid) return;
      const accounts = await AccountStore.getAll();
      const accIds   = new Set(accounts.map(a => a.id));
      const rows = legacy.map(s => ({
        id: IS_UUID(s.id) ? s.id : newUUID(),
        user_id: uid,
        ...subToRow({
          ...s,
          accountId: accIds.has(s.accountId) ? s.accountId : null,
          name: s.name, amount: s.amount, frequency: s.frequency || 'monthly',
          nextDue: s.nextDue, categoryId: s.categoryId, color: s.color,
          autoLog: s.autoLog, active: s.active,
        }),
      }));
      const { error } = await sb.from('subscriptions').insert(rows);
      if (!error) await SettingsStore.setSubscriptions([]);
    } catch (_) { /* legacy data stays in the blob; retried next load */ }
  },

  async getAll() {
    if (await this._detect() === 'legacy') return SettingsStore.getSubscriptions();
    const { data, error } = await sb.from('subscriptions').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data || []).map(subToCamel);
  },

  async add(sub) {
    if (await this._detect() === 'legacy') {
      const list = await SettingsStore.getSubscriptions();
      sub.id = newUUID();
      list.push(sub);
      await SettingsStore.setSubscriptions(list);
      return sub;
    }
    const uid = await userId();
    const { data, error } = await sb.from('subscriptions').insert({ user_id: uid, ...subToRow(sub) }).select().single();
    if (error) throw new Error(error.message);
    return subToCamel(data);
  },

  async update(id, patch) {
    if (await this._detect() === 'legacy') {
      const list = await SettingsStore.getSubscriptions();
      const idx  = list.findIndex(s => s.id === id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], ...patch };
      await SettingsStore.setSubscriptions(list);
      return list[idx];
    }
    const { data, error } = await sb.from('subscriptions').update(subToRow(patch)).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return subToCamel(data);
  },

  async remove(id) {
    if (await this._detect() === 'legacy') {
      const list = await SettingsStore.getSubscriptions();
      await SettingsStore.setSubscriptions(list.filter(s => s.id !== id));
      return;
    }
    const { error } = await sb.from('subscriptions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getDue() {
    const today = new Date().toISOString().slice(0, 10);
    const list  = await this.getAll();
    return list.filter(s => s.active !== false && s.nextDue <= today);
  },

  async advanceNext(id) {
    if (await this._detect() === 'legacy') {
      const list = await SettingsStore.getSubscriptions();
      const sub  = list.find(s => s.id === id);
      if (!sub) return;
      sub.nextDue = advanceDate(sub.nextDue, sub.frequency);
      await SettingsStore.setSubscriptions(list);
      return;
    }
    const list = await this.getAll();
    const sub  = list.find(s => s.id === id);
    if (!sub) return;
    const { error } = await sb.from('subscriptions').update({ next_due: advanceDate(sub.nextDue, sub.frequency) }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};

/* ============================================================
   SHIFT STORE — Supabase table `shifts` (work hours + pay).
   Table-first with a localStorage fallback + lazy migration once
   the table exists (mirrors CryptoStore). A logged shift may link
   to an income transaction via `txId`.
   Shift (camel): { id, date, start, end, breakMin, rate, employer,
                    accountId, categoryId, txId, note }
   ============================================================ */
function shiftToRow(s) {
  const row = {};
  if (s.date       !== undefined) row.date        = s.date;
  if (s.start      !== undefined) row.start_time  = s.start || '';
  if (s.end        !== undefined) row.end_time    = s.end   || '';
  if (s.breakMin   !== undefined) row.break_min   = Number(s.breakMin) || 0;
  if (s.rate       !== undefined) row.rate        = Number(s.rate) || 0;
  if (s.employer   !== undefined) row.employer    = s.employer || '';
  if (s.payMode    !== undefined) row.pay_mode    = s.payMode === 'fixed' ? 'fixed' : 'hourly';
  if (s.fixedPay   !== undefined) row.fixed_pay   = Number(s.fixedPay) || 0;
  if (s.tips       !== undefined) row.tips        = Number(s.tips) || 0;
  if (s.accountId  !== undefined) row.account_id  = s.accountId  || null;
  if (s.categoryId !== undefined) row.category_id = s.categoryId || null;
  if (s.txId       !== undefined) row.tx_id       = s.txId       || null;
  if (s.note       !== undefined) row.note        = s.note || '';
  return row;
}
function shiftToCamel(r) {
  return {
    id: r.id, date: r.date, start: r.start_time || '', end: r.end_time || '',
    breakMin: r.break_min || 0, rate: Number(r.rate) || 0, employer: r.employer || '',
    payMode: r.pay_mode === 'fixed' ? 'fixed' : 'hourly',
    fixedPay: Number(r.fixed_pay) || 0, tips: Number(r.tips) || 0,
    accountId: r.account_id || null, categoryId: r.category_id || null,
    txId: r.tx_id || null, note: r.note || '',
  };
}

const ShiftStore = {
  _key: 'pf_shifts',
  _mode: null,

  _local() { try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch { return []; } },
  _persistLocal(list) { localStorage.setItem(this._key, JSON.stringify(list)); },

  /* default hourly rate — local convenience, pre-fills the form */
  getDefaultRate() { return Number(localStorage.getItem('pf_shift_rate')) || 0; },
  setDefaultRate(r) { localStorage.setItem('pf_shift_rate', String(Number(r) || 0)); },

  /* "Job defaults" — the default job/salary used by the dashboard quick-log.
     { employer, rate, accountId }. rate shares the pf_shift_rate key above so
     logging a shift on the tracker keeps it in sync. */
  getJobDefaults() {
    return {
      employer:  localStorage.getItem('pf_job_employer') || '',
      rate:      this.getDefaultRate(),
      accountId: localStorage.getItem('pf_job_account') || '',
    };
  },
  setJobDefaults({ employer, rate, accountId }) {
    if (employer !== undefined) {
      if (employer) localStorage.setItem('pf_job_employer', employer);
      else localStorage.removeItem('pf_job_employer');
    }
    if (rate !== undefined) this.setDefaultRate(rate);
    if (accountId !== undefined) {
      if (accountId) localStorage.setItem('pf_job_account', accountId);
      else localStorage.removeItem('pf_job_account');
    }
  },

  /* weekly goal — local convenience. { metric: 'pay'|'hours', target:number }.
     Drives the progress ring on the Hours Tracker. target 0 = no goal set. */
  _goalKey: 'pf_shift_goal',
  getGoal() {
    try {
      const g = JSON.parse(localStorage.getItem(this._goalKey) || '{}');
      return { metric: g.metric === 'hours' ? 'hours' : 'pay', target: Number(g.target) || 0 };
    } catch { return { metric: 'pay', target: 0 }; }
  },
  setGoal(goal) {
    const g = { metric: goal.metric === 'hours' ? 'hours' : 'pay', target: Math.max(0, Number(goal.target) || 0) };
    localStorage.setItem(this._goalKey, JSON.stringify(g));
    return g;
  },

  /* shift presets (saved templates) — local convenience for fast logging.
     Preset: { id, name, employer, start, end, breakMin, payMode, rate,
               fixedPay, accountId, categoryId } */
  _presetKey: 'pf_shift_presets',
  getPresets() {
    try { return JSON.parse(localStorage.getItem(this._presetKey) || '[]'); }
    catch { return []; }
  },
  savePreset(preset) {
    const list = this.getPresets();
    if (preset.id) {
      const i = list.findIndex(p => p.id === preset.id);
      if (i >= 0) list[i] = preset; else list.push(preset);
    } else {
      preset.id = 'ps_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      list.push(preset);
    }
    localStorage.setItem(this._presetKey, JSON.stringify(list));
    return preset;
  },
  removePreset(id) {
    localStorage.setItem(this._presetKey, JSON.stringify(this.getPresets().filter(p => p.id !== id)));
  },

  async _detect() {
    if (this._mode) return this._mode;
    const { error } = await sb.from('shifts').select('id').limit(1);
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
      const rows = legacy.map(s => ({ id: IS_UUID(s.id) ? s.id : newUUID(), user_id: uid, ...shiftToRow(s) }));
      const { error } = await sb.from('shifts').insert(rows);
      if (!error) this._persistLocal([]);
    } catch (_) { /* local data stays until the next successful load */ }
  },

  async getAll() {
    if (await this._detect() === 'local') {
      return this._local().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }
    const { data, error } = await sb.from('shifts').select('*').order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(shiftToCamel);
  },

  async getById(id) { return (await this.getAll()).find(s => s.id === id) || null; },

  async add(shift) {
    if (await this._detect() === 'local') {
      const list = this._local();
      shift.id = newUUID();
      list.push(shift);
      this._persistLocal(list);
      return shift;
    }
    const uid = await userId();
    const { data, error } = await sb.from('shifts').insert({ user_id: uid, ...shiftToRow(shift) }).select().single();
    if (error) throw new Error(error.message);
    return shiftToCamel(data);
  },

  async update(id, patch) {
    if (await this._detect() === 'local') {
      const list = this._local();
      const idx  = list.findIndex(s => s.id === id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], ...patch };
      this._persistLocal(list);
      return list[idx];
    }
    const { data, error } = await sb.from('shifts').update(shiftToRow(patch)).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return shiftToCamel(data);
  },

  async remove(id) {
    if (await this._detect() === 'local') {
      this._persistLocal(this._local().filter(s => s.id !== id));
      return;
    }
    const { error } = await sb.from('shifts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

/* ============================================================
   FORMAT HELPERS
   ============================================================ */
const CURRENCY_LOCALES = {
  USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP',
  CAD: 'en-CA', AUD: 'en-AU', CHF: 'de-CH', INR: 'en-IN',
  BRL: 'pt-BR', MXN: 'es-MX',
};

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatCurrency(amount) {
  const currency = localStorage.getItem('pf_currency') || 'CAD';
  const locale   = CURRENCY_LOCALES[currency] || 'en-CA';
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: currency === 'JPY' ? 0 : 2,
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
  toast.style.cursor = 'pointer';
  container.appendChild(toast);

  const dismiss = () => {
    if (toast.classList.contains('toast--dismissing')) return;
    toast.classList.add('toast--dismissing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  toast.addEventListener('click', dismiss);
  setTimeout(dismiss, 3200);
}

/* ============================================================
   CSV SERVICE — export / import transactions
   ============================================================ */
const CSVService = {
  HEADERS: ['date','type','amount','note','category','account','to_account','tags'],

  /* Export to CSV. Pass `subset` (e.g. the current filtered view) to export
     just those; omit to export every transaction. */
  async export(subset = null) {
    const [txs, accounts, cats] = await Promise.all([
      subset ? Promise.resolve(subset) : TransactionStore.getAll(),
      AccountStore.getAll(),
      CategoryStore.getAll(),
    ]);
    const accMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
    const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = txs.map(t => [
      t.date,
      t.type,
      t.amount,
      escape(t.note),
      escape(catMap[t.categoryId] || t.categoryId || ''),
      escape(accMap[t.accountId]  || t.accountId  || ''),
      escape(accMap[t.toAccountId] || ''),
      escape((t.tags || []).join(';')),
    ].join(','));

    const csv = [this.HEADERS.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `transactions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async import(file) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV is empty or has no data rows');

    const header = lines[0].toLowerCase().split(',').map(h => h.replace(/"/g,'').trim());
    const idx = k => header.indexOf(k);

    const [accounts, cats] = await Promise.all([
      AccountStore.getAll(),
      CategoryStore.getAll(),
    ]);
    const accByName = Object.fromEntries(accounts.map(a => [a.name.toLowerCase(), a.id]));
    const catByName = Object.fromEntries(cats.map(c => [c.name.toLowerCase(), c.id]));

    const parseCell = s => s.replace(/^"|"$/g, '').replace(/""/g, '"').trim();

    const rows = lines.slice(1);
    let imported = 0, skipped = 0;
    for (const line of rows) {
      try {
        const cells = line.match(/("(?:[^"]|"")*"|[^,]*)/g).map(parseCell);
        const type   = cells[idx('type')]?.toLowerCase();
        const amount = parseFloat(cells[idx('amount')]);
        if (!['income','expense','transfer'].includes(type) || !amount || amount <= 0) { skipped++; continue; }

        const catName  = cells[idx('category')]?.toLowerCase();
        const accName  = cells[idx('account')]?.toLowerCase();
        const toName   = cells[idx('to_account')]?.toLowerCase();
        const tagsRaw  = cells[idx('tags')] || '';

        await TransactionStore.add({
          date:        cells[idx('date')] || new Date().toISOString().slice(0,10),
          type,
          amount,
          note:        cells[idx('note')] || '',
          categoryId:  catByName[catName] || null,
          accountId:   accByName[accName] || accounts[0]?.id || null,
          toAccountId: accByName[toName]  || null,
          tags:        tagsRaw ? tagsRaw.split(';').map(t => t.trim()).filter(Boolean) : [],
        });
        imported++;
      } catch { skipped++; }
    }
    return { imported, skipped };
  },
};
