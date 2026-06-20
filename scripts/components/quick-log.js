/* ============================================================
   quick-log.js — Dashboard "Log hours" widget.
   Pick a day of the current week, enter the hours (or a start→end
   time range), and log — the hourly rate, deposit account and job
   name come from your Job defaults (Settings). Mirrors the Hours
   Tracker save path: a paying shift also creates a linked income
   transaction (tags:['shift']). Exposes window.QuickLog.init.
   Depends on ShiftStore, ShiftEngine, TransactionStore,
   AccountStore, formatCurrency, escapeHTML, showToast.
   ============================================================ */
(function () {
'use strict';

let _accounts = [];
let _incomeCats = [];
let _onLogged = null;
let _selected = null;            /* selected day, YYYY-MM-DD */
let _mode = 'hours';             /* 'hours' | 'times' */

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const iso = d => d.toISOString().slice(0, 10);
const todayISO = () => iso(new Date());
function fmtHours(h) { return `${(Math.round(h * 100) / 100).toFixed(h % 1 === 0 ? 0 : 1)} h`; }

function weekRange() {
  const from = ShiftEngine.weekStart(todayISO());
  const to = new Date(from + 'T00:00:00'); to.setDate(to.getDate() + 6);
  return { from, to: iso(to) };
}

/* current week, Monday→Sunday */
function weekDays() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = todayISO();
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const ds = iso(d);
    out.push({ date: ds, dow: DOW[i], num: d.getDate(), isToday: ds === t, isFuture: ds > t });
  }
  return out;
}

/* start time + decimal hours → end "HH:MM" (wraps past midnight) */
function addHours(start, h) {
  const [hh, mm] = start.split(':').map(Number);
  let total = hh * 60 + mm + Math.round(h * 60);
  total = ((total % 1440) + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

/* Shared save: build the shift, log income when it pays, link the two. */
async function logShift(data) {
  const pay = ShiftEngine.pay(data);
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

/* ---- day chips ---- */
function renderDays() {
  const row = document.getElementById('qlDays');
  if (!row) return;
  row.innerHTML = weekDays().map(d => `
    <button type="button" class="ql-day${d.date === _selected ? ' selected' : ''}${d.isFuture ? ' ql-day--disabled' : ''}"
            data-date="${d.date}"${d.isFuture ? ' disabled' : ''}>
      <span class="ql-day__dow">${d.isToday ? 'Today' : d.dow}</span>
      <span class="ql-day__num">${d.num}</span>
    </button>`).join('');
  row.querySelectorAll('.ql-day:not([disabled])').forEach(b =>
    b.addEventListener('click', () => { _selected = b.dataset.date; renderDays(); }));
}

/* ---- rate/account caption ---- */
function renderHint() {
  const el = document.getElementById('qlRateHint');
  if (!el) return;
  const job = ShiftStore.getJobDefaults();
  if (job.rate > 0) {
    const acc = _accounts.find(a => a.id === job.accountId) || _accounts[0];
    el.innerHTML = `Paid <strong>${formatCurrency(job.rate)}/h</strong>${acc ? ` → ${escapeHTML(acc.name)}` : ''}`;
  } else {
    el.innerHTML = `<a href="pages/settings.html">Set your hourly rate in Settings →</a>`;
  }
}

function setMode(mode) {
  _mode = mode === 'times' ? 'times' : 'hours';
  document.querySelectorAll('#qlMode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === _mode));
  document.getElementById('qlHoursRow').hidden = _mode !== 'hours';
  document.getElementById('qlTimesRow').hidden = _mode !== 'times';
}

/* ---- submit ---- */
async function submitForm(e) {
  e.preventDefault();
  const job = ShiftStore.getJobDefaults();
  let start, end;
  if (_mode === 'times') {
    start = document.getElementById('qlStart').value;
    end   = document.getElementById('qlEnd').value;
    if (!start || !end) { showToast('Enter a start and end time', 'error'); return; }
  } else {
    const hours = parseFloat(document.getElementById('qlHours').value) || 0;
    if (hours <= 0) { showToast('Enter the number of hours', 'error'); return; }
    start = '09:00'; end = addHours(start, hours);
  }

  const btn = document.getElementById('qlSubmit');
  btn.disabled = true;
  try {
    const pay = await logShift({
      date: _selected || todayISO(), employer: job.employer || '', start, end, breakMin: 0,
      payMode: 'hourly', rate: job.rate || 0, fixedPay: 0, tips: 0,
      accountId: job.accountId || _accounts[0]?.id || null,
      categoryId: _incomeCats[0]?.id || null,
    });
    const hrs = ShiftEngine.hours({ start, end });
    showToast(pay > 0 ? `Logged ${fmtHours(hrs)} · +${formatCurrency(pay)}` : `Logged ${fmtHours(hrs)}`, 'success');
    document.getElementById('qlHours').value = '';
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
  renderDays();   /* "Today" highlight, in case the day rolled over */
  if (typeof _onLogged === 'function') { try { await _onLogged(); } catch (_) {} }
}

/* ---- init ---- */
async function init(opts = {}) {
  if (typeof ShiftStore === 'undefined' || typeof ShiftEngine === 'undefined') return;
  _onLogged = opts.onLogged || null;
  if (!document.getElementById('quickLog')) return;

  try {
    _accounts   = await AccountStore.getAll();
    _incomeCats = await CategoryStore.getByType('income');
  } catch (_) { _accounts = []; _incomeCats = []; }

  _selected = todayISO();
  setMode('hours');
  renderDays();
  renderHint();
  await renderStat();

  document.querySelectorAll('#qlMode .seg-btn').forEach(b =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.getElementById('quicklogForm')?.addEventListener('submit', submitForm);
}

window.QuickLog = { init };

})();
