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
    return { currency: 'CAD', budgets: {}, custom_categories: [], recurring_rules: [], subscriptions: [] };
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

  async getRecurringRules() {
    const s = await this._load();
    return Array.isArray(s.recurring_rules) ? s.recurring_rules : [];
  },

  async setRecurringRules(rules) {
    if (this._cache) this._cache.recurring_rules = rules;
    await this._save({ recurring_rules: rules });
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
   RECURRING STORE — Supabase table `recurring_rules`.
   Falls back to the legacy user_settings jsonb blob until the
   table exists; migrates blob rows into the table once it does.
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

function ruleToCamel(r) {
  return {
    id: r.id, note: r.note, amount: Number(r.amount), type: r.type,
    categoryId: r.category_id, accountId: r.account_id, toAccountId: r.to_account_id,
    frequency: r.frequency, nextDue: r.next_due, endDate: r.end_date,
    active: r.active, createdAt: r.created_at,
  };
}

function ruleToRow(r) {
  const row = {};
  if (r.note        !== undefined) row.note          = r.note || '';
  if (r.amount      !== undefined) row.amount        = r.amount;
  if (r.type        !== undefined) row.type          = r.type;
  if (r.categoryId  !== undefined) row.category_id   = r.categoryId  || null;
  if (r.accountId   !== undefined) row.account_id    = r.accountId   || null;
  if (r.toAccountId !== undefined) row.to_account_id = r.toAccountId || null;
  if (r.frequency   !== undefined) row.frequency     = r.frequency;
  if (r.nextDue     !== undefined) row.next_due      = r.nextDue;
  if (r.endDate     !== undefined) row.end_date      = r.endDate || null;
  if (r.active      !== undefined) row.active        = r.active !== false;
  return row;
}

const RecurringStore = {
  _mode: null,

  async _detect() {
    if (this._mode) return this._mode;
    const { error } = await sb.from('recurring_rules').select('id').limit(1);
    this._mode = error ? 'legacy' : 'table';
    if (this._mode === 'table') await this._migrate();
    return this._mode;
  },

  async _migrate() {
    try {
      const legacy = await SettingsStore.getRecurringRules();
      if (!legacy.length) return;
      const uid = await userId();
      if (!uid) return;
      const accounts = await AccountStore.getAll();
      const accIds   = new Set(accounts.map(a => a.id));
      const rows = legacy.map(r => ({
        id: IS_UUID(r.id) ? r.id : newUUID(),
        user_id: uid,
        ...ruleToRow({
          ...r,
          accountId:   accIds.has(r.accountId)   ? r.accountId   : null,
          toAccountId: accIds.has(r.toAccountId) ? r.toAccountId : null,
          note: r.note || '', amount: r.amount, type: r.type || 'expense',
          frequency: r.frequency || 'monthly', nextDue: r.nextDue, endDate: r.endDate, active: r.active,
          categoryId: r.categoryId,
        }),
      }));
      const { error } = await sb.from('recurring_rules').insert(rows);
      if (!error) await SettingsStore.setRecurringRules([]);
    } catch (_) { /* legacy data stays in the blob; retried next load */ }
  },

  async getAll() {
    if (await this._detect() === 'legacy') return SettingsStore.getRecurringRules();
    const { data, error } = await sb.from('recurring_rules').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data || []).map(ruleToCamel);
  },

  async add(rule) {
    if (await this._detect() === 'legacy') {
      const rules = await SettingsStore.getRecurringRules();
      rule.id = newUUID();
      rules.push(rule);
      await SettingsStore.setRecurringRules(rules);
      return rule;
    }
    const uid = await userId();
    const { data, error } = await sb.from('recurring_rules').insert({ user_id: uid, ...ruleToRow(rule) }).select().single();
    if (error) throw new Error(error.message);
    return ruleToCamel(data);
  },

  async remove(id) {
    if (await this._detect() === 'legacy') {
      const rules = await SettingsStore.getRecurringRules();
      await SettingsStore.setRecurringRules(rules.filter(r => r.id !== id));
      return;
    }
    const { error } = await sb.from('recurring_rules').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getDue() {
    const today = new Date().toISOString().slice(0, 10);
    const rules = await this.getAll();
    return rules.filter(r => r.active !== false && r.nextDue <= today);
  },

  async advanceNext(id) {
    if (await this._detect() === 'legacy') {
      const rules = await SettingsStore.getRecurringRules();
      const rule  = rules.find(r => r.id === id);
      if (!rule) return;
      rule.nextDue = advanceDate(rule.nextDue, rule.frequency);
      await SettingsStore.setRecurringRules(rules);
      return;
    }
    const rules = await this.getAll();
    const rule  = rules.find(r => r.id === id);
    if (!rule) return;
    const { error } = await sb.from('recurring_rules').update({ next_due: advanceDate(rule.nextDue, rule.frequency) }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async toggle(id) {
    if (await this._detect() === 'legacy') {
      const rules = await SettingsStore.getRecurringRules();
      const rule  = rules.find(r => r.id === id);
      if (!rule) return;
      rule.active = rule.active === false ? true : false;
      await SettingsStore.setRecurringRules(rules);
      return;
    }
    const rules = await this.getAll();
    const rule  = rules.find(r => r.id === id);
    if (!rule) return;
    const { error } = await sb.from('recurring_rules').update({ active: rule.active === false }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};

/* ============================================================
   SUBSCRIPTION STORE — Supabase table `subscriptions`.
   Same table-first / legacy-fallback / lazy-migration pattern
   as RecurringStore.
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

  async export() {
    const [txs, accounts, cats] = await Promise.all([
      TransactionStore.getAll(),
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
