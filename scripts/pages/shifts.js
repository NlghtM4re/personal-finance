/* ============================================================
   shifts.js (page) — Hours Tracker.
   Fast shift logging: presets, day-of-week chips, hourly-or-total
   pay, tips, weekly-grouped list. Hours/pay math is in
   scripts/engine/shifts.js (ShiftEngine). A logged shift creates a
   linked income transaction (tags:['shift']).
   ============================================================ */

/* Wrapped in an IIFE: store.js (loaded first) already declares globals like
   `todayISO`, and top-level `const`/`let` in a plain script share global
   scope — a name clash there is a SyntaxError that aborts the whole file. */
(function () {
'use strict';

let _shifts = [];
let _accounts = [];
let _incomeCats = [];
let _payMode = 'hourly';

const iso = d => d.toISOString().slice(0, 10);
const todayISO = () => iso(new Date());

function startOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;            /* 0 = Monday */
  d.setDate(d.getDate() - dow);
  return iso(d);
}
function weekRange() {
  const from = startOfWeek(todayISO());
  const to = new Date(from + 'T00:00:00'); to.setDate(to.getDate() + 6);
  return { from, to: iso(to) };
}
function monthRange() {
  const d = new Date();
  return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
           to:   iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

/* ---- stats ---- */
function renderStats() {
  const wk = ShiftEngine.summarize(_shifts, weekRange());
  const mo = ShiftEngine.summarize(_shifts, monthRange());
  const all = ShiftEngine.summarize(_shifts);
  setText('weekPay',  formatCurrency(wk.pay));
  setText('weekHours', `${wk.hours} h · ${wk.count} shift${wk.count === 1 ? '' : 's'}`);
  setText('monthPay', formatCurrency(mo.pay));
  setText('monthHours', `${mo.hours} h · ${mo.count} shift${mo.count === 1 ? '' : 's'}`);
  setText('totalPay', formatCurrency(all.pay));
  setText('totalShifts', `${all.count} shift${all.count === 1 ? '' : 's'} · ${all.hours} h`);
}

/* ---- list (grouped by week) ---- */
function weekLabel(weekStart) {
  const thisWk = startOfWeek(todayISO());
  const lastWk = (() => { const d = new Date(thisWk + 'T00:00:00'); d.setDate(d.getDate() - 7); return iso(d); })();
  if (weekStart === thisWk) return 'This week';
  if (weekStart === lastWk) return 'Last week';
  return 'Week of ' + new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function shiftRowHTML(s) {
  const hours = ShiftEngine.hours(s);
  const pay   = ShiftEngine.pay(s);
  const bits  = [escapeHTML(s.employer || 'Shift')];
  if (s.payMode === 'fixed') bits.push('flat');
  else if (s.start && s.end) bits.push(`${fmtTime(s.start)}–${fmtTime(s.end)}`);
  if (s.breakMin) bits.push(`${s.breakMin}m brk`);
  if (s.tips)     bits.push(`+${formatCurrency(s.tips)} tips`);
  return `
    <div class="shift-row" data-id="${s.id}">
      <div class="shift-row__main">
        <div class="shift-row__date">${fmtDay(s.date)}</div>
        <div class="shift-row__meta">${bits.join(' · ')}</div>
      </div>
      <div class="shift-row__figs">
        <div class="shift-row__hours">${hours > 0 ? hours.toFixed(2) + ' h' : '—'}</div>
        <div class="shift-row__pay">${pay > 0 ? '+' + formatCurrency(pay) : '—'}</div>
      </div>
      ${s.txId ? '<span class="shift-row__badge" title="Logged as income">income</span>' : '<span class="shift-row__badge shift-row__badge--off" title="Not logged as income">unlogged</span>'}
      <button type="button" class="btn btn--ghost btn--sm shift-edit" data-id="${s.id}">Edit</button>
    </div>`;
}

function renderList() {
  const el = document.getElementById('shiftsList');
  if (!el) return;
  if (!_shifts.length) {
    el.innerHTML = `<div class="card empty-state" style="padding:36px 24px;text-align:center;">
        <div style="font-weight:600;color:var(--color-text);margin-bottom:6px;">No hours logged yet</div>
        <div style="font-size:.8125rem;">Tap <strong>Log shift</strong> — or a preset above — to add your first one.</div>
      </div>`;
    return;
  }
  const groups = {};
  _shifts.forEach(s => { const k = startOfWeek(s.date); (groups[k] = groups[k] || []).push(s); });
  const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  el.innerHTML = keys.map(k => {
    const sum = ShiftEngine.summarize(groups[k]);
    return `<div class="card week-group">
      <div class="week-group__head">
        <span class="week-group__title">${weekLabel(k)}</span>
        <span class="week-group__sub">${sum.hours} h · ${formatCurrency(sum.pay)}</span>
      </div>
      ${groups[k].map(shiftRowHTML).join('')}
    </div>`;
  }).join('');
  el.querySelectorAll('.shift-edit').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.id)));
}

/* ---- presets ---- */
function renderPresets() {
  const wrap = document.getElementById('hoursQuicklog');
  const row  = document.getElementById('hoursPresets');
  if (!wrap || !row) return;
  const presets = ShiftStore.getPresets();
  wrap.hidden = presets.length === 0;
  row.innerHTML = presets.map(p => `
    <span class="hours-preset">
      <button type="button" class="hours-preset__use" data-id="${p.id}">${escapeHTML(p.name)}</button>
      <button type="button" class="hours-preset__del" data-id="${p.id}" aria-label="Remove preset">✕</button>
    </span>`).join('');
  row.querySelectorAll('.hours-preset__use').forEach(b =>
    b.addEventListener('click', () => usePreset(b.dataset.id)));
  row.querySelectorAll('.hours-preset__del').forEach(b =>
    b.addEventListener('click', () => {
      if (!confirm('Remove this preset?')) return;
      ShiftStore.removePreset(b.dataset.id);
      renderPresets();
    }));
}

function usePreset(id) {
  const p = ShiftStore.getPresets().find(x => x.id === id);
  if (!p) return;
  openAdd();
  document.getElementById('sEmployer').value = p.employer || '';
  document.getElementById('sStart').value = p.start || '';
  document.getElementById('sEnd').value = p.end || '';
  document.getElementById('sBreak').value = p.breakMin || 0;
  document.getElementById('sRate').value = p.rate || '';
  document.getElementById('sFixed').value = p.fixedPay || '';
  if (p.accountId)  document.getElementById('sAccount').value = p.accountId;
  if (p.categoryId) document.getElementById('sCategory').value = p.categoryId;
  setPayMode(p.payMode === 'fixed' ? 'fixed' : 'hourly');
  payPreview();
}

/* ---- form helpers ---- */
function renderDayChips(selected) {
  const el = document.getElementById('dayChips');
  if (!el) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const val = iso(d);
    const dow = i === 0 ? 'Today' : i === 1 ? 'Yest' : d.toLocaleDateString('en-US', { weekday: 'short' });
    html += `<button type="button" class="day-chip${val === selected ? ' selected' : ''}" data-date="${val}">
      <span class="day-chip__dow">${dow}</span>
      <span class="day-chip__date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
    </button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.day-chip').forEach(b => b.addEventListener('click', () => setDate(b.dataset.date)));
}
function setDate(val) {
  document.getElementById('sDate').value = val;
  renderDayChips(val);
}

function setPayMode(mode) {
  _payMode = mode === 'fixed' ? 'fixed' : 'hourly';
  document.querySelectorAll('.paymode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === _payMode));
  document.getElementById('hourlyField').hidden = _payMode !== 'hourly';
  document.getElementById('fixedField').hidden  = _payMode !== 'fixed';
  payPreview();
}

function readForm() {
  return {
    date:       document.getElementById('sDate').value,
    employer:   document.getElementById('sEmployer').value.trim(),
    start:      document.getElementById('sStart').value,
    end:        document.getElementById('sEnd').value,
    breakMin:   parseInt(document.getElementById('sBreak').value) || 0,
    payMode:    _payMode,
    rate:       parseFloat(document.getElementById('sRate').value) || 0,
    fixedPay:   parseFloat(document.getElementById('sFixed').value) || 0,
    tips:       parseFloat(document.getElementById('sTips').value) || 0,
    accountId:  document.getElementById('sAccount').value || null,
    categoryId: document.getElementById('sCategory').value || null,
  };
}

function payPreview() {
  const s = readForm();
  const h = ShiftEngine.hours(s), p = ShiftEngine.pay(s);
  const el = document.getElementById('shiftPayPreview');
  if (!el) return;
  if (p <= 0 && h <= 0) { el.textContent = '—'; return; }
  const tips = Number(s.tips) || 0;
  el.textContent = `${h > 0 ? h.toFixed(2) + ' h  ·  ' : ''}${formatCurrency(p)}${tips > 0 ? `  (incl. ${formatCurrency(tips)} tips)` : ''}`;
}

function syncIncomeFields() {
  document.getElementById('shiftIncomeFields').style.display =
    document.getElementById('sLogIncome').checked ? '' : 'none';
}
function showForm(show) {
  const card = document.getElementById('shiftFormCard');
  card.hidden = !show;
  if (show) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openAdd() {
  document.getElementById('sEditId').value = '';
  document.getElementById('shiftFormTitle').textContent = 'Log shift';
  document.getElementById('sEmployer').value = '';
  document.getElementById('sStart').value = '';
  document.getElementById('sEnd').value = '';
  document.getElementById('sBreak').value = '0';
  document.getElementById('sTips').value = '';
  document.getElementById('sRate').value = ShiftStore.getDefaultRate() || '';
  document.getElementById('sFixed').value = '';
  document.getElementById('sLogIncome').checked = true;
  document.getElementById('shiftDelete').hidden = true;
  setDate(todayISO());
  setPayMode('hourly');
  syncIncomeFields(); payPreview(); showForm(true);
}

function openEdit(id) {
  const s = _shifts.find(x => x.id === id);
  if (!s) return;
  document.getElementById('sEditId').value = s.id;
  document.getElementById('shiftFormTitle').textContent = 'Edit shift';
  document.getElementById('sEmployer').value = s.employer || '';
  document.getElementById('sStart').value = s.start || '';
  document.getElementById('sEnd').value = s.end || '';
  document.getElementById('sBreak').value = s.breakMin || 0;
  document.getElementById('sTips').value = s.tips || '';
  document.getElementById('sRate').value = s.rate || '';
  document.getElementById('sFixed').value = s.fixedPay || '';
  document.getElementById('sLogIncome').checked = !!s.txId;
  document.getElementById('shiftDelete').hidden = false;
  setDate(s.date || todayISO());
  setPayMode(s.payMode === 'fixed' ? 'fixed' : 'hourly');
  if (s.accountId)  document.getElementById('sAccount').value = s.accountId;
  if (s.categoryId) document.getElementById('sCategory').value = s.categoryId;
  syncIncomeFields(); payPreview(); showForm(true);
}

/* ---- save / delete (with income-transaction linking) ---- */
async function saveShift(e) {
  e.preventDefault();
  const editId = document.getElementById('sEditId').value;
  const logIncome = document.getElementById('sLogIncome').checked;
  const data = readForm();
  if (!data.date) { showToast('Pick a day', 'error'); return; }

  const btn = document.getElementById('shiftSubmit');
  btn.disabled = true;
  try {
    const pay = ShiftEngine.pay(data);
    if (data.payMode === 'hourly' && data.rate > 0) ShiftStore.setDefaultRate(data.rate);

    const existing = editId ? _shifts.find(s => s.id === editId) : null;
    let txId = existing ? existing.txId : null;

    if (logIncome && pay > 0) {
      const payload = {
        date: data.date, amount: pay, type: 'income',
        categoryId: data.categoryId || null, accountId: data.accountId || null,
        note: data.employer || 'Shift', tags: ['shift'],
      };
      if (txId) { try { await TransactionStore.update(txId, payload); } catch { txId = (await TransactionStore.add(payload)).id; } }
      else      { txId = (await TransactionStore.add(payload)).id; }
    } else if (txId) {
      try { await TransactionStore.delete(txId); } catch (_) {}
      txId = null;
    }
    data.txId = txId;

    if (editId) await ShiftStore.update(editId, data);
    else        await ShiftStore.add(data);

    showForm(false);
    await renderPage();
    showToast(editId ? 'Shift updated' : 'Shift logged', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save shift', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteShift() {
  const id = document.getElementById('sEditId').value;
  const s = _shifts.find(x => x.id === id);
  if (!s) return;
  if (!confirm(s.txId ? 'Delete this shift and its logged income entry?' : 'Delete this shift?')) return;
  try {
    if (s.txId) { try { await TransactionStore.delete(s.txId); } catch (_) {} }
    await ShiftStore.remove(id);
    showForm(false);
    await renderPage();
    showToast('Shift deleted', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

function saveAsPreset() {
  const d = readForm();
  const name = (prompt('Name this preset (e.g. “Café day”):', d.employer || '') || '').trim().slice(0, 40);
  if (!name) return;
  ShiftStore.savePreset({
    name, employer: d.employer, start: d.start, end: d.end, breakMin: d.breakMin,
    payMode: d.payMode, rate: d.rate, fixedPay: d.fixedPay,
    accountId: d.accountId, categoryId: d.categoryId,
  });
  renderPresets();
  showToast(`Preset “${name}” saved`, 'success');
}

/* ---- init ---- */
async function loadOptions() {
  _accounts   = await AccountStore.getAll();
  _incomeCats = await CategoryStore.getByType('income');
  const accSel = document.getElementById('sAccount');
  if (accSel) accSel.innerHTML = '<option value="">— none —</option>' +
    _accounts.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('');
  const catSel = document.getElementById('sCategory');
  if (catSel) catSel.innerHTML = '<option value="">— none —</option>' +
    _incomeCats.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
}

async function renderPage() {
  _shifts = await ShiftStore.getAll();
  renderStats();
  renderList();
  renderPresets();
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  try {
    await loadOptions();
    await renderPage();
  } catch (err) {
    console.error('Hours Tracker error:', err);
    showToast('Error loading shifts: ' + err.message, 'error');
  }

  document.getElementById('addShiftBtn')?.addEventListener('click', openAdd);
  document.getElementById('closeShiftForm')?.addEventListener('click', () => showForm(false));
  document.getElementById('shiftForm')?.addEventListener('submit', saveShift);
  document.getElementById('shiftDelete')?.addEventListener('click', deleteShift);
  document.getElementById('savePresetBtn')?.addEventListener('click', saveAsPreset);
  document.getElementById('sLogIncome')?.addEventListener('change', syncIncomeFields);
  document.getElementById('sDate')?.addEventListener('change', e => renderDayChips(e.target.value));
  document.querySelectorAll('.paymode-btn').forEach(b => b.addEventListener('click', () => setPayMode(b.dataset.mode)));
  ['sStart', 'sEnd', 'sBreak', 'sRate', 'sFixed', 'sTips'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', payPreview));
});

})();
