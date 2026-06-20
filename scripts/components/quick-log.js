/* ============================================================
   quick-log.js — Dashboard "Log hours" widget.
   One-tap preset logging + a minimal start/end/rate mini-form,
   both for *today*. Mirrors the Hours Tracker save path: a logged
   shift with pay > 0 also creates a linked income transaction
   (tags:['shift']). Exposes window.QuickLog.init({ onLogged }).
   Depends on ShiftStore, ShiftEngine, TransactionStore,
   AccountStore, formatCurrency, escapeHTML, showToast.
   ============================================================ */
(function () {
'use strict';

let _accounts = [];
let _incomeCats = [];
let _onLogged = null;

const todayISO = () => new Date().toISOString().slice(0, 10);
function fmtHours(h) { return `${(Math.round(h * 100) / 100).toFixed(h % 1 === 0 ? 0 : 1)} h`; }

function weekRange() {
  const from = ShiftEngine.weekStart(todayISO());
  const to = new Date(from + 'T00:00:00'); to.setDate(to.getDate() + 6);
  return { from, to: to.toISOString().slice(0, 10) };
}

/* Shared save: build the shift, log income when it pays, link the two. */
async function logShift(data) {
  const pay = ShiftEngine.pay(data);
  if (data.payMode === 'hourly' && data.rate > 0) ShiftStore.setDefaultRate(data.rate);
  let txId = null;
  if (pay > 0) {
    txId = (await TransactionStore.add({
      date: data.date, amount: pay, type: 'income',
      categoryId: data.categoryId || null, accountId: data.accountId || null,
      note: data.employer || 'Shift', tags: ['shift'],
    })).id;
  }
  data.txId = txId;
  await ShiftStore.add(data);
  return pay;
}

/* ---- presets (one-tap) ---- */
function renderPresets() {
  const row = document.getElementById('quicklogPresets');
  if (!row) return;
  const presets = ShiftStore.getPresets();
  if (!presets.length) { row.hidden = true; return; }
  row.hidden = false;
  row.innerHTML = presets.map(p =>
    `<button type="button" class="quicklog-chip" data-id="${p.id}">${escapeHTML(p.name)}</button>`
  ).join('');
  row.querySelectorAll('.quicklog-chip').forEach(b =>
    b.addEventListener('click', () => usePreset(b.dataset.id, b)));
}

async function usePreset(id, btn) {
  const p = ShiftStore.getPresets().find(x => x.id === id);
  if (!p) return;
  if (btn) btn.disabled = true;
  try {
    const pay = await logShift({
      date: todayISO(), employer: p.employer || '', start: p.start || '', end: p.end || '',
      breakMin: p.breakMin || 0, payMode: p.payMode === 'fixed' ? 'fixed' : 'hourly',
      rate: p.rate || 0, fixedPay: p.fixedPay || 0, tips: 0,
      accountId: p.accountId || _accounts[0]?.id || null,
      categoryId: p.categoryId || null,
    });
    showToast(pay > 0 ? `Logged ${p.name} · +${formatCurrency(pay)}` : `Logged ${p.name}`, 'success');
    await afterLog();
  } catch (err) {
    showToast(err.message || 'Failed to log', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---- mini-form ---- */
async function submitForm(e) {
  e.preventDefault();
  const start = document.getElementById('qlStart').value;
  const end   = document.getElementById('qlEnd').value;
  const rate  = parseFloat(document.getElementById('qlRate').value) || 0;
  const accountId = document.getElementById('qlAccount').value || null;
  if (!start || !end) { showToast('Enter a start and end time', 'error'); return; }

  const btn = document.getElementById('qlSubmit');
  btn.disabled = true;
  try {
    const pay = await logShift({
      date: todayISO(), employer: '', start, end, breakMin: 0,
      payMode: 'hourly', rate, fixedPay: 0, tips: 0,
      accountId, categoryId: _incomeCats[0]?.id || null,
    });
    const hrs = ShiftEngine.hours({ start, end });
    showToast(pay > 0 ? `Logged ${fmtHours(hrs)} · +${formatCurrency(pay)}` : `Logged ${fmtHours(hrs)}`, 'success');
    document.getElementById('qlStart').value = '';
    document.getElementById('qlEnd').value = '';
    await afterLog();
  } catch (err) {
    showToast(err.message || 'Failed to log', 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---- this-week stat ---- */
async function renderStat() {
  const el = document.getElementById('quicklogStat');
  if (!el) return;
  try {
    const shifts = await ShiftStore.getAll();
    const wk = ShiftEngine.summarize(shifts, weekRange());
    el.innerHTML = wk.count
      ? `This week · <strong>${fmtHours(wk.hours)}</strong> · <strong>${formatCurrency(wk.pay)}</strong>`
      : `No hours logged this week yet.`;
  } catch { el.textContent = ''; }
}

async function afterLog() {
  await renderStat();
  if (typeof _onLogged === 'function') { try { await _onLogged(); } catch (_) {} }
}

/* ---- init ---- */
async function init(opts = {}) {
  if (typeof ShiftStore === 'undefined' || typeof ShiftEngine === 'undefined') return;
  _onLogged = opts.onLogged || null;
  const widget = document.getElementById('quickLog');
  if (!widget) return;

  try {
    _accounts   = await AccountStore.getAll();
    _incomeCats = await CategoryStore.getByType('income');
  } catch (_) { _accounts = []; _incomeCats = []; }

  const accSel = document.getElementById('qlAccount');
  if (accSel) {
    accSel.innerHTML = _accounts.length
      ? _accounts.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('')
      : '<option value="">No account</option>';
  }
  const rateInput = document.getElementById('qlRate');
  if (rateInput && !rateInput.value) {
    const def = ShiftStore.getDefaultRate();
    if (def > 0) rateInput.value = def;
  }

  renderPresets();
  await renderStat();

  document.getElementById('quicklogForm')?.addEventListener('submit', submitForm);
}

window.QuickLog = { init };

})();
