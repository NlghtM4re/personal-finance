/* ============================================================
   add-transaction.js — Add / Edit form (async)
   ============================================================ */

let selectedType     = 'expense';
let selectedCategory = '';
let editId           = null;

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
  setType(tx.type);
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

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  initForm();

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
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
        tags:        [],
      };
      if (editId) { await TransactionStore.update(editId, data); showToast('Transaction updated', 'success'); }
      else        { await TransactionStore.add(data);            showToast('Transaction added',   'success'); }
      setTimeout(() => window.location.href = 'transactions.html', 500);
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
    setTimeout(() => window.location.href = 'transactions.html', 500);
  });

  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    history.length > 1 ? history.back() : window.location.href = 'transactions.html';
  });
});
