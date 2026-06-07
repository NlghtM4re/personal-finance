/* ============================================================
   add-transaction.js — Add / Edit form (async)
   ============================================================ */

let selectedType     = 'expense';
let selectedCategory = '';
let editId           = null;
let selectedTags     = [];

async function initForm() {
  const params = new URLSearchParams(window.location.search);
  editId       = params.get('id');

  await populateAccountSelects();
  await renderCategoryPicker();

  if (editId) {
    const tx = await TransactionStore.getById(editId);
    if (tx) await prefillForm(tx);
    document.getElementById('formTitle').textContent   = 'Edit Transaction';
    document.getElementById('submitBtn').textContent   = 'Save Changes';
    document.getElementById('deleteBtn').style.display = 'inline-flex';
  }

  const dateInput = document.getElementById('txDate');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
}

async function populateAccountSelects() {
  const accounts = await AccountStore.getAll();
  const sel      = document.getElementById('txAccount');
  const toSel    = document.getElementById('txToAccount');
  const opts     = accounts.length
    ? accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')
    : `<option value="">No accounts — create one first</option>`;
  if (sel)   sel.innerHTML   = opts;
  if (toSel) toSel.innerHTML = opts;

  const tip = document.getElementById('noAccountTip');
  if (tip) tip.style.display = accounts.length ? 'none' : 'block';
}

async function renderCategoryPicker() {
  const container = document.getElementById('categoryPicker');
  if (!container) return;
  const cats = selectedType === 'transfer'
    ? []
    : await CategoryStore.getByType(selectedType);
  container.innerHTML = cats.map(c => `
    <button type="button" class="category-btn${selectedCategory === c.id ? ' selected' : ''}" data-cat="${c.id}">
      <span class="cat-icon">${c.icon}</span>
      <span>${c.name}</span>
    </button>
  `).join('');
  container.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => { selectedCategory = btn.dataset.cat; renderCategoryPicker(); });
  });
}

async function prefillForm(tx) {
  setValue('txAmount',    tx.amount);
  setValue('txDate',      tx.date);
  setValue('txNote',      tx.note);
  setValue('txAccount',   tx.accountId);
  setValue('txToAccount', tx.toAccountId || '');
  selectedCategory = tx.categoryId || '';
  selectedTags     = Array.isArray(tx.tags) ? [...tx.tags] : [];
  renderTags();
  setType(tx.type);
}

function renderTags() {
  const list = document.getElementById('tagList');
  if (!list) return;
  list.innerHTML = selectedTags.map(tag => `
    <span class="tag-pill">
      ${tag}
      <button type="button" class="tag-pill__remove" data-tag="${tag}" aria-label="Remove ${tag}">×</button>
    </span>
  `).join('');
  list.querySelectorAll('.tag-pill__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTags = selectedTags.filter(t => t !== btn.dataset.tag);
      renderTags();
    });
  });
}

function addTag(raw) {
  const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24);
  if (tag && !selectedTags.includes(tag)) { selectedTags.push(tag); renderTags(); }
}

function setType(type) {
  selectedType = type;
  document.querySelectorAll('.type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === type));
  const toGroup = document.getElementById('toAccountGroup');
  if (toGroup) toGroup.style.display = type === 'transfer' ? 'flex' : 'none';
  renderCategoryPicker();
}

function validateForm() {
  const amount    = parseFloat(document.getElementById('txAmount')?.value);
  const accountId = document.getElementById('txAccount')?.value;
  clearErrors();
  let valid = true;
  if (!amount || amount <= 0) { showError('txAmount', 'Enter a valid amount greater than 0'); valid = false; }
  if (!accountId)             { showError('txAccount', 'Select an account'); valid = false; }
  if (selectedType === 'transfer' && !document.getElementById('txToAccount')?.value) {
    showError('txToAccount', 'Select a destination account'); valid = false;
  }
  return valid;
}

function showError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('form-control--error');
  const err = document.createElement('div');
  err.className = 'form-error'; err.textContent = message;
  field.parentNode.appendChild(err);
}
function clearErrors() {
  document.querySelectorAll('.form-control--error').forEach(el => el.classList.remove('form-control--error'));
  document.querySelectorAll('.form-error').forEach(el => el.remove());
}
function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function computeNextDue(fromDate, frequency) {
  const d = new Date(fromDate + 'T00:00:00');
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

function showSaveSuccess() {
  const actions = document.getElementById('formActions');
  if (!actions) { setTimeout(() => window.location.href = 'accounts.html', 500); return; }
  actions.innerHTML = `
    <div class="save-success">
      <div class="save-success__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span class="save-success__label">Transaction saved!</span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <a href="accounts.html" class="btn btn--ghost" style="flex:1;justify-content:center;">View Transactions</a>
      <button type="button" class="btn btn--primary" id="addAnotherBtn" style="flex:1;">Add Another</button>
    </div>
  `;
  document.getElementById('addAnotherBtn')?.addEventListener('click', () => {
    selectedType     = 'expense';
    selectedCategory = '';
    selectedTags     = [];
    document.getElementById('txForm')?.reset();
    setType('expense');
    renderTags();
    document.getElementById('txDate').value = todayISO();
    actions.innerHTML = `
      <button type="submit" class="btn btn--primary" id="submitBtn" style="flex:1;">Add Transaction</button>
      <button type="button" class="btn btn--danger btn--sm" id="deleteBtn" style="display:none;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        Delete
      </button>
    `;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  /* Set currency prefix */
  SettingsStore.getCurrency().then(c => {
    const prefixEl = document.getElementById('currencyPrefix');
    if (prefixEl) {
      try {
        const sym = (0).toLocaleString('en', { style: 'currency', currency: c, minimumFractionDigits: 0 }).replace(/[\d,.\s]/g, '').trim();
        prefixEl.textContent = sym || '$';
      } catch { prefixEl.textContent = '$'; }
    }
  });

  try {
    await initForm();
  } catch (err) {
    console.error('Form error:', err);
    showToast('Error loading form: ' + err.message, 'error');
  }

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
  });

  const recurringToggle = document.getElementById('recurringToggle');
  const recurringOptions = document.getElementById('recurringOptions');
  recurringToggle?.addEventListener('change', () => {
    if (recurringOptions) recurringOptions.style.display = recurringToggle.checked ? 'block' : 'none';
  });

  const tagInput = document.getElementById('tagInput');
  tagInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput.value);
      tagInput.value = '';
    }
  });
  tagInput?.addEventListener('blur', () => {
    if (tagInput.value.trim()) { addTag(tagInput.value); tagInput.value = ''; }
  });

  document.getElementById('txForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm()) return;
    const btn = document.getElementById('submitBtn');
    btn.classList.add('btn--loading');
    btn.disabled = true;
    try {
      const data = {
        amount:      parseFloat(document.getElementById('txAmount').value),
        date:        document.getElementById('txDate').value,
        note:        document.getElementById('txNote').value.trim(),
        accountId:   document.getElementById('txAccount').value,
        toAccountId: document.getElementById('txToAccount')?.value || null,
        categoryId:  selectedCategory,
        type:        selectedType,
        tags:        [...selectedTags],
      };
      if (editId) {
        await TransactionStore.update(editId, data);
        showToast('Transaction updated', 'success');
        setTimeout(() => window.location.href = 'accounts.html', 500);
      } else {
        await TransactionStore.add(data);
        const isRecurring = document.getElementById('recurringToggle')?.checked;
        if (isRecurring) {
          const freq    = document.getElementById('recurringFreq')?.value || 'monthly';
          const endDate = document.getElementById('recurringEnd')?.value || null;
          RecurringStore.add({
            note:        data.note,
            amount:      data.amount,
            type:        data.type,
            categoryId:  data.categoryId,
            accountId:   data.accountId,
            toAccountId: data.toAccountId || null,
            frequency:   freq,
            nextDue:     computeNextDue(data.date, freq),
            endDate,
            active:      true,
          });
        }
        showSaveSuccess();
      }
    } catch (err) {
      showToast(err.message || 'Something went wrong', 'error');
      btn.classList.remove('btn--loading');
      btn.disabled = false;
    }
  });

  document.getElementById('deleteBtn')?.addEventListener('click', async () => {
    if (!editId || !confirm('Delete this transaction?')) return;
    await TransactionStore.delete(editId);
    showToast('Transaction deleted', 'success');
    setTimeout(() => window.location.href = 'accounts.html', 500);
  });

  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    history.length > 1 ? history.back() : window.location.href = 'accounts.html';
  });
});
