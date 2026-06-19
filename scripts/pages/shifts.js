/* ============================================================
   shifts.js (page) — work-hours tracker.
   Hours/pay math lives in scripts/engine/shifts.js (ShiftEngine).
   A logged shift creates an income transaction (tags:['shift'])
   so it flows into balance, cash flow, insights and the forecast.
   ============================================================ */

let _shifts = [];
let _accounts = [];
let _incomeCats = [];

const iso = d => d.toISOString().slice(0, 10);

function weekRange() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;            /* 0 = Monday */
  const mon = new Date(d); mon.setDate(d.getDate() - dow);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: iso(mon), to: iso(sun) };
}
function monthRange() {
  const d = new Date();
  return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
           to:   iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, '0')} ${ampm}`;
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

/* ---- render ---- */
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

function shiftRowHTML(s) {
  const hours = ShiftEngine.hours(s);
  const pay   = ShiftEngine.pay(s);
  const meta  = [escapeHTML(s.employer || 'Shift'),
    s.start && s.end ? `${fmtTime(s.start)}–${fmtTime(s.end)}` : '',
    s.breakMin ? `${s.breakMin}m break` : ''].filter(Boolean).join(' · ');
  return `
    <div class="shift-row" data-id="${s.id}">
      <div class="shift-row__main">
        <div class="shift-row__date">${formatDate(s.date)}</div>
        <div class="shift-row__meta">${meta}</div>
      </div>
      <div class="shift-row__figs">
        <div class="shift-row__hours">${hours.toFixed(2)} h</div>
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
    el.innerHTML = `<div class="empty-state" style="padding:36px 24px;text-align:center;">
        <div style="font-weight:600;color:var(--color-text);margin-bottom:6px;">No shifts logged yet</div>
        <div style="font-size:.8125rem;">Click <strong>Add shift</strong> to log your first one.</div>
      </div>`;
    return;
  }
  el.innerHTML = _shifts.map(shiftRowHTML).join('');
  el.querySelectorAll('.shift-edit').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.id)));
}

/* ---- form ---- */
function payPreview() {
  const s = readForm();
  const h = ShiftEngine.hours(s), p = ShiftEngine.pay(s);
  const el = document.getElementById('shiftPayPreview');
  if (el) el.textContent = h > 0 ? `${h.toFixed(2)} h  ·  ${formatCurrency(p)}` : '—';
}

function readForm() {
  return {
    date:     document.getElementById('sDate').value,
    start:    document.getElementById('sStart').value,
    end:      document.getElementById('sEnd').value,
    breakMin: parseInt(document.getElementById('sBreak').value) || 0,
    rate:     parseFloat(document.getElementById('sRate').value) || 0,
    employer: document.getElementById('sEmployer').value.trim(),
    accountId: document.getElementById('sAccount').value || null,
    categoryId: document.getElementById('sCategory').value || null,
  };
}

function syncIncomeFields() {
  const on = document.getElementById('sLogIncome').checked;
  document.getElementById('shiftIncomeFields').style.display = on ? '' : 'none';
}

function showForm(show) {
  document.getElementById('shiftFormCard').style.display = show ? '' : 'none';
  if (show) document.getElementById('shiftFormCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openAdd() {
  document.getElementById('sEditId').value = '';
  document.getElementById('shiftFormTitle').textContent = 'New shift';
  document.getElementById('sDate').value = iso(new Date());
  document.getElementById('sEmployer').value = '';
  document.getElementById('sStart').value = '';
  document.getElementById('sEnd').value = '';
  document.getElementById('sBreak').value = '0';
  document.getElementById('sRate').value = ShiftStore.getDefaultRate() || '';
  document.getElementById('sLogIncome').checked = true;
  document.getElementById('shiftDelete').style.display = 'none';
  syncIncomeFields(); payPreview(); showForm(true);
}

function openEdit(id) {
  const s = _shifts.find(x => x.id === id);
  if (!s) return;
  document.getElementById('sEditId').value = s.id;
  document.getElementById('shiftFormTitle').textContent = 'Edit shift';
  document.getElementById('sDate').value = s.date || '';
  document.getElementById('sEmployer').value = s.employer || '';
  document.getElementById('sStart').value = s.start || '';
  document.getElementById('sEnd').value = s.end || '';
  document.getElementById('sBreak').value = s.breakMin || 0;
  document.getElementById('sRate').value = s.rate || '';
  document.getElementById('sLogIncome').checked = !!s.txId;
  document.getElementById('sAccount').value = s.accountId || '';
  document.getElementById('sCategory').value = s.categoryId || '';
  document.getElementById('shiftDelete').style.display = '';
  syncIncomeFields(); payPreview(); showForm(true);
}

/* ---- save / delete (with income-transaction linking) ---- */
async function saveShift(e) {
  e.preventDefault();
  const editId = document.getElementById('sEditId').value;
  const logIncome = document.getElementById('sLogIncome').checked;
  const data = readForm();
  if (!data.date || !data.start || !data.end) { showToast('Date, start and end are required', 'error'); return; }

  const btn = document.getElementById('shiftSubmit');
  btn.disabled = true;
  try {
    const pay = ShiftEngine.pay(data);
    if (data.rate > 0) ShiftStore.setDefaultRate(data.rate);

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
    showToast(editId ? 'Shift updated' : 'Shift added', 'success');
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
  const msg = s.txId
    ? 'Delete this shift and its logged income entry?'
    : 'Delete this shift?';
  if (!confirm(msg)) return;
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
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  try {
    await loadOptions();
    await renderPage();
  } catch (err) {
    console.error('Shifts error:', err);
    showToast('Error loading shifts: ' + err.message, 'error');
  }

  document.getElementById('addShiftBtn')?.addEventListener('click', openAdd);
  document.getElementById('closeShiftForm')?.addEventListener('click', () => showForm(false));
  document.getElementById('shiftForm')?.addEventListener('submit', saveShift);
  document.getElementById('shiftDelete')?.addEventListener('click', deleteShift);
  document.getElementById('sLogIncome')?.addEventListener('change', syncIncomeFields);
  ['sStart', 'sEnd', 'sBreak', 'sRate'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', payPreview));
});
