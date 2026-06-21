/* ============================================================
   shifts.js (page) — Hours Tracker.
   A data-rich work-hours hub: live stats with week-over-week
   change, a weekly goal ring, a 10-week earnings bar chart,
   day-of-week and per-job breakdowns, fast preset logging, and a
   filterable weekly-grouped log. Hours/pay math is pure in
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
let _goal = { metric: 'pay', target: 0 };
let _chartMetric = 'pay';
let _employerFilter = '';

const iso = d => isoLocal(d);
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
function lastWeekRange() {
  const from = new Date(startOfWeek(todayISO()) + 'T00:00:00'); from.setDate(from.getDate() - 7);
  const to = new Date(from); to.setDate(to.getDate() + 6);
  return { from: iso(from), to: iso(to) };
}
function monthRange() {
  const d = new Date();
  return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
           to:   iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
function last30Range() {
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - 29);
  return { from: iso(from), to: iso(to) };
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
function fmtHours(h) { return `${(Math.round(h * 100) / 100).toFixed(h % 1 === 0 ? 0 : 1)} h`; }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ============================================================
   STATS BAR
   ============================================================ */
function renderStats() {
  const wk = ShiftEngine.summarize(_shifts, weekRange());
  const lwk = ShiftEngine.summarize(_shifts, lastWeekRange());
  const mo = ShiftEngine.summarize(_shifts, monthRange());
  const all = ShiftEngine.summarize(_shifts);
  const eff = ShiftEngine.effectiveRate(_shifts, last30Range());

  setText('weekPay',  formatCurrency(wk.pay));
  setText('weekHours', `${fmtHours(wk.hours)} · ${wk.count} shift${wk.count === 1 ? '' : 's'}`);
  setText('monthPay', formatCurrency(mo.pay));
  setText('monthHours', `${fmtHours(mo.hours)} · ${mo.count} shift${mo.count === 1 ? '' : 's'}`);
  setText('effRate', eff > 0 ? formatCurrency(eff) : '—');
  setText('totalPay', formatCurrency(all.pay));
  setText('totalShifts', `${all.count} shift${all.count === 1 ? '' : 's'} · ${fmtHours(all.hours)}`);

  /* week-over-week change pill */
  const pill = document.getElementById('weekDelta');
  if (pill) {
    if (lwk.pay > 0.005 || wk.pay > 0.005) {
      const diff = wk.pay - lwk.pay;
      const pct = lwk.pay > 0.005 ? (diff / lwk.pay) * 100 : (wk.pay > 0 ? 100 : 0);
      const up = diff >= 0;
      pill.hidden = false;
      pill.className = `flow-pill ${Math.abs(diff) < 0.005 ? 'flow-pill--flat' : up ? 'flow-pill--up' : 'flow-pill--down'}`;
      pill.textContent = `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% wk`;
    } else {
      pill.hidden = true;
    }
  }
}

/* ============================================================
   WEEKLY GOAL — ring + pace
   ============================================================ */
function ringSVG(pct) {
  const r = 30, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, pct / 100));
  const reached = pct >= 100;
  const color = reached ? 'var(--color-income)' : 'var(--color-primary)';
  return `<svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--color-border)" stroke-width="7"/>
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="${color}" stroke-width="7"
      stroke-dasharray="${c}" stroke-dashoffset="${(c * (1 - frac)).toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 38 38)" style="transition:stroke-dashoffset .5s ease"/>
  </svg>`;
}

function renderGoal() {
  const ring = document.getElementById('goalRing');
  const pctEl = document.getElementById('goalPct');
  const detail = document.getElementById('goalDetail');
  const pace = document.getElementById('goalPace');
  if (!ring) return;

  if (!_goal.target) {
    ring.innerHTML = ringSVG(0);
    pctEl.textContent = '—';
    detail.textContent = 'No goal set yet';
    pace.textContent = '';
    pace.className = 'goal-info__pace';
    return;
  }

  const wk = ShiftEngine.summarize(_shifts, weekRange());
  const current = _goal.metric === 'hours' ? wk.hours : wk.pay;
  const fmt = v => _goal.metric === 'hours' ? fmtHours(v) : formatCurrency(v);
  const pct = _goal.target > 0 ? (current / _goal.target) * 100 : 0;

  ring.innerHTML = ringSVG(pct);
  pctEl.textContent = `${Math.round(pct)}%`;
  detail.innerHTML = `${fmt(current)} <span class="goal-info__of">of ${fmt(_goal.target)}</span>`;

  /* pace vs how far through the week we are (Mon=day 1 … Sun=day 7) */
  const dow = (new Date().getDay() + 6) % 7;          /* 0=Mon */
  const elapsed = dow + 1;
  const expected = _goal.target * (elapsed / 7);
  if (pct >= 100) {
    pace.textContent = '✓ Goal reached';
    pace.className = 'goal-info__pace goal-info__pace--up';
  } else {
    const gap = current - expected;
    const remaining = _goal.target - current;
    if (gap >= -0.005) {
      pace.textContent = `On pace · ${fmt(remaining)} to go`;
      pace.className = 'goal-info__pace goal-info__pace--up';
    } else {
      pace.textContent = `${fmt(Math.abs(gap))} behind pace`;
      pace.className = 'goal-info__pace goal-info__pace--down';
    }
  }
}

function setGoalMetric(metric) {
  const m = metric === 'hours' ? 'hours' : 'pay';
  document.querySelectorAll('#goalEdit .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.metric === m));
  document.getElementById('goalPrefix').textContent = m === 'hours' ? '' : '$';
  document.getElementById('goalSuffix').textContent = m === 'hours' ? 'h / week' : '/ week';
  document.getElementById('goalEdit').dataset.metric = m;
}
function openGoalEdit() {
  document.getElementById('goalDisplay').hidden = true;
  document.getElementById('goalEdit').hidden = false;
  setGoalMetric(_goal.metric);
  document.getElementById('goalTarget').value = _goal.target || '';
  document.getElementById('goalTarget').focus();
}
function closeGoalEdit() {
  document.getElementById('goalEdit').hidden = true;
  document.getElementById('goalDisplay').hidden = false;
}
function saveGoal(e) {
  e.preventDefault();
  const metric = document.getElementById('goalEdit').dataset.metric || 'pay';
  const target = parseFloat(document.getElementById('goalTarget').value) || 0;
  _goal = ShiftStore.setGoal({ metric, target });
  closeGoalEdit();
  renderGoal();
  showToast(target > 0 ? 'Goal saved' : 'Goal cleared', 'success');
}
function clearGoal() {
  _goal = ShiftStore.setGoal({ metric: _goal.metric, target: 0 });
  closeGoalEdit();
  renderGoal();
}

/* ============================================================
   EARNINGS CHART — 10-week bars (pay or hours)
   ============================================================ */
function renderChart() {
  const el = document.getElementById('hoursBars');
  if (!el) return;
  const series = ShiftEngine.weeklySeries(_shifts, 10, todayISO());
  const vals = series.map(w => _chartMetric === 'hours' ? w.hours : w.pay);
  const max = Math.max(...vals, 0);
  const thisWk = startOfWeek(todayISO());

  if (max <= 0) {
    el.innerHTML = `<div class="hours-bars__empty">No earnings in the last 10 weeks yet.</div>`;
    return;
  }
  el.innerHTML = series.map((w, i) => {
    const v = vals[i];
    const h = max > 0 ? (v / max) * 100 : 0;
    const isNow = w.weekStart === thisWk;
    const label = new Date(w.weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const valLabel = _chartMetric === 'hours' ? fmtHours(w.hours) : formatCurrency(w.pay);
    return `<div class="hbar${isNow ? ' hbar--now' : ''}" title="Week of ${label} · ${valLabel}">
      <div class="hbar__val">${v > 0 ? (_chartMetric === 'hours' ? Math.round(w.hours) : formatCurrencyShort(w.pay)) : ''}</div>
      <div class="hbar__track"><div class="hbar__fill" style="height:${Math.max(v > 0 ? 3 : 0, h)}%"></div></div>
      <div class="hbar__label">${label.replace(/ \d+$/, m => m)}</div>
    </div>`;
  }).join('');
}

/* compact money for tight bar tops (e.g. $1.2k) */
function formatCurrencyShort(v) {
  if (v >= 1000) return '$' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(v);
}

/* ============================================================
   BY DAY OF WEEK
   ============================================================ */
function renderDayOfWeek() {
  const el = document.getElementById('dowGrid');
  if (!el) return;
  const rows = ShiftEngine.byDayOfWeek(_shifts);
  const max = Math.max(...rows.map(r => r.pay), 0);
  const best = rows.reduce((a, b) => (b.pay > a.pay ? b : a), rows[0]);
  setText('dowBest', max > 0 ? `best · ${DOW[best.dow]}` : '');

  el.innerHTML = rows.map(r => {
    const h = max > 0 ? (r.pay / max) * 100 : 0;
    const isBest = max > 0 && r.dow === best.dow;
    return `<div class="dow-col" title="${DOW[r.dow]} · ${fmtHours(r.hours)} · ${formatCurrency(r.pay)}">
      <div class="dow-col__track"><div class="dow-col__fill${isBest ? ' dow-col__fill--best' : ''}" style="height:${Math.max(r.pay > 0 ? 4 : 0, h)}%"></div></div>
      <div class="dow-col__day">${DOW[r.dow][0]}</div>
    </div>`;
  }).join('');
}

/* ============================================================
   BY JOB / EMPLOYER
   ============================================================ */
function renderJobs() {
  const el = document.getElementById('jobList');
  if (!el) return;
  const jobs = ShiftEngine.byEmployer(_shifts);
  if (!jobs.length) {
    el.innerHTML = `<div class="empty-state" style="padding:22px 14px;">No jobs logged yet.</div>`;
    return;
  }
  const max = Math.max(...jobs.map(j => j.pay), 0);
  el.innerHTML = jobs.slice(0, 6).map(j => {
    const w = max > 0 ? (j.pay / max) * 100 : 0;
    return `<div class="job-row">
      <div class="job-row__bar" style="width:${Math.max(2, w)}%"></div>
      <div class="job-row__main">
        <span class="job-row__name">${escapeHTML(j.employer)}</span>
        <span class="job-row__meta">${fmtHours(j.hours)}${j.rate > 0 ? ` · ${formatCurrency(j.rate)}/h` : ''} · ${j.count} shift${j.count === 1 ? '' : 's'}</span>
      </div>
      <span class="job-row__pay">${formatCurrency(j.pay)}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   PRESETS (quick log)
   ============================================================ */
function renderPresets() {
  const row = document.getElementById('hoursPresets');
  const hint = document.getElementById('quickHint');
  if (!row) return;
  const presets = ShiftStore.getPresets();
  if (hint) hint.hidden = presets.length > 0;
  row.innerHTML = presets.map(p => `
    <span class="hours-preset">
      <button type="button" class="hours-preset__use" data-id="${p.id}">${escapeHTML(p.name)}</button>
      <button type="button" class="hours-preset__del" data-id="${p.id}" aria-label="Remove preset">✕</button>
    </span>`).join('');
  row.querySelectorAll('.hours-preset__use').forEach(b =>
    b.addEventListener('click', () => usePreset(b.dataset.id)));
  row.querySelectorAll('.hours-preset__del').forEach(b =>
    b.addEventListener("click", async () => {
      if (!await confirmDialog("Remove this preset?", { confirmText: "Remove" })) return;
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

/* ============================================================
   LIST (grouped by week, filterable by employer)
   ============================================================ */
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

function renderEmployerFilter() {
  const sel = document.getElementById('employerFilter');
  if (!sel) return;
  const names = [...new Set(_shifts.map(s => (s.employer || '').trim()).filter(Boolean))].sort();
  if (names.length < 2) { sel.hidden = true; return; }
  sel.hidden = false;
  sel.innerHTML = `<option value="">All jobs</option>` +
    names.map(n => `<option value="${escapeHTML(n)}"${n === _employerFilter ? ' selected' : ''}>${escapeHTML(n)}</option>`).join('');
}

function renderList() {
  const el = document.getElementById('shiftsList');
  if (!el) return;
  if (!_shifts.length) {
    el.innerHTML = `<div class="empty-state" style="padding:36px 24px;text-align:center;">
        <div style="font-weight:600;color:var(--color-text);margin-bottom:6px;">No hours logged yet</div>
        <div style="font-size:.8125rem;">Tap <strong>+ Log shift</strong> — or a preset above — to add your first one.</div>
      </div>`;
    return;
  }
  const list = _employerFilter
    ? _shifts.filter(s => (s.employer || '').trim() === _employerFilter)
    : _shifts;
  if (!list.length) {
    el.innerHTML = `<div class="empty-state" style="padding:28px 24px;">No shifts for that job.</div>`;
    return;
  }
  const groups = {};
  list.forEach(s => { const k = startOfWeek(s.date); (groups[k] = groups[k] || []).push(s); });
  const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  el.innerHTML = keys.map(k => {
    const sum = ShiftEngine.summarize(groups[k]);
    return `<div class="week-group">
      <div class="week-group__head">
        <span class="week-group__title">${weekLabel(k)}</span>
        <span class="week-group__sub">${fmtHours(sum.hours)} · ${formatCurrency(sum.pay)}</span>
      </div>
      ${groups[k].map(shiftRowHTML).join('')}
    </div>`;
  }).join('');
  el.querySelectorAll('.shift-edit').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.id)));
}

/* ============================================================
   FORM HELPERS
   ============================================================ */
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

/* ============================================================
   SAVE / DELETE (with income-transaction linking)
   ============================================================ */
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
  if (!await confirmDialog(s.txId ? 'Delete this shift and its logged income entry?' : 'Delete this shift?', { confirmText: 'Delete' })) return;
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

async function saveAsPreset() {
  const d = readForm();
  const name = ((await promptDialog('Name this preset (e.g. “Café day”):', d.employer || '', { confirmText: 'Save preset', maxlength: 40 })) || '').trim().slice(0, 40);
  if (!name) return;
  ShiftStore.savePreset({
    name, employer: d.employer, start: d.start, end: d.end, breakMin: d.breakMin,
    payMode: d.payMode, rate: d.rate, fixedPay: d.fixedPay,
    accountId: d.accountId, categoryId: d.categoryId,
  });
  renderPresets();
  showToast(`Preset “${name}” saved`, 'success');
}

/* ============================================================
   INIT
   ============================================================ */
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

function renderEmployerDatalist() {
  const dl = document.getElementById('employerList');
  if (!dl) return;
  const names = [...new Set(_shifts.map(s => (s.employer || '').trim()).filter(Boolean))].sort();
  dl.innerHTML = names.map(n => `<option value="${escapeHTML(n)}"></option>`).join('');
}

async function renderPage() {
  _shifts = await ShiftStore.getAll();
  renderStats();
  renderGoal();
  renderChart();
  renderDayOfWeek();
  renderJobs();
  renderPresets();
  renderEmployerFilter();
  renderEmployerDatalist();
  renderList();
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  _goal = ShiftStore.getGoal();
  try {
    await loadOptions();
    await renderPage();
  } catch (err) {
    console.error('Hours Tracker error:', err);
    showToast('Error loading shifts: ' + err.message, 'error');
  }

  /* form */
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

  /* goal */
  document.getElementById('editGoalBtn')?.addEventListener('click', openGoalEdit);
  document.getElementById('goalEdit')?.addEventListener('submit', saveGoal);
  document.getElementById('clearGoalBtn')?.addEventListener('click', clearGoal);
  document.querySelectorAll('#goalEdit .seg-btn').forEach(b =>
    b.addEventListener('click', () => setGoalMetric(b.dataset.metric)));

  /* chart metric toggle */
  document.querySelectorAll('#chartMetricToggle .seg-btn').forEach(b =>
    b.addEventListener('click', () => {
      _chartMetric = b.dataset.metric === 'hours' ? 'hours' : 'pay';
      document.querySelectorAll('#chartMetricToggle .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      renderChart();
    }));

  /* employer filter */
  document.getElementById('employerFilter')?.addEventListener('change', e => {
    _employerFilter = e.target.value;
    renderList();
  });
});

})();
