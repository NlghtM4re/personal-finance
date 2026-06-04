/* ============================================================
   add-transaction.js — Add / Edit transaction form logic
   ============================================================ */

let selectedType     = 'expense';
let selectedCategory = '';
let editId           = null;

function initForm() {
  const params = new URLSearchParams(window.location.search);
  editId       = params.get('id');

  populateAccountSelect();
  renderCategoryPicker();

  if (editId) {
    const tx = TransactionStore.getById(editId);
    if (tx) prefillForm(tx);
    document.getElementById('formTitle').textContent     = 'Edit Transaction';
    document.getElementById('submitBtn').textContent     = 'Save Changes';
    document.getElementById('deleteBtn').style.display   = 'inline-flex';
  }

  /* Default date to today */
  const dateInput = document.getElementById('txDate');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
}

function populateAccountSelect() {
  const sel = document.getElementById('txAccount');
  if (!sel) return;
  const accounts = AccountStore.getAll();
  if (!accounts.length) {
    sel.innerHTML = `<option value="">No accounts — create one first</option>`;
    return;
  }
  sel.innerHTML = accounts.map(a =>
    `<option value="${a.id}">${a.name}</option>`
  ).join('');
}

function renderCategoryPicker() {
  const container = document.getElementById('categoryPicker');
  if (!container) return;
  const cats = CategoryStore.getAll().filter(c =>
    selectedType === 'transfer' ? false : c.type === selectedType || c.type === 'both'
  );
  container.innerHTML = cats.map(c => `
    <button type="button" class="category-btn${selectedCategory === c.id ? ' selected' : ''}" data-cat="${c.id}">
      <span class="cat-icon">${c.icon}</span>
      <span>${c.name}</span>
    </button>
  `).join('');
  container.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCategory = btn.dataset.cat;
      renderCategoryPicker();
    });
  });
}

function prefillForm(tx) {
  setValue('txAmount',   tx.amount);
  setValue('txDate',     tx.date);
  setValue('txNote',     tx.note);
  setValue('txAccount',  tx.accountId);
  setValue('txToAccount',tx.toAccountId || '');
  selectedCategory = tx.categoryId;
  setType(tx.type);
}

function setType(type) {
  selectedType = type;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  const toGroup = document.getElementById('toAccountGroup');
  if (toGroup) toGroup.style.display = type === 'transfer' ? 'flex' : 'none';
  renderCategoryPicker();
}

function validateForm() {
  const amount   = parseFloat(document.getElementById('txAmount')?.value);
  const accountId = document.getElementById('txAccount')?.value;
  let valid = true;

  clearErrors();
  if (!amount || amount <= 0) {
    showError('txAmount', 'Enter a valid amount greater than 0');
    valid = false;
  }
  if (!accountId) {
    showError('txAccount', 'Select an account');
    valid = false;
  }
  if (selectedType === 'transfer' && !document.getElementById('txToAccount')?.value) {
    showError('txToAccount', 'Select a destination account');
    valid = false;
  }
  return valid;
}

function showError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('form-control--error');
  const err = document.createElement('div');
  err.className = 'form-error';
  err.textContent = message;
  field.parentNode.appendChild(err);
}

function clearErrors() {
  document.querySelectorAll('.form-control--error').forEach(el => el.classList.remove('form-control--error'));
  document.querySelectorAll('.form-error').forEach(el => el.remove());
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

document.addEventListener('DOMContentLoaded', () => {
  initForm();

  /* Type toggle buttons */
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
  });

  /* Form submit */
  document.getElementById('txForm')?.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm()) return;

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

    if (editId) {
      TransactionStore.update(editId, data);
      showToast('Transaction updated', 'success');
    } else {
      TransactionStore.add(data);
      showToast('Transaction added', 'success');
    }

    setTimeout(() => {
      window.location.href = 'transactions.html';
    }, 500);
  });

  /* Delete (edit mode) */
  document.getElementById('deleteBtn')?.addEventListener('click', () => {
    if (!editId) return;
    if (confirm('Delete this transaction?')) {
      TransactionStore.delete(editId);
      showToast('Transaction deleted', 'success');
      setTimeout(() => window.location.href = 'transactions.html', 500);
    }
  });

  /* Cancel */
  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    history.length > 1 ? history.back() : window.location.href = 'transactions.html';
  });
});
