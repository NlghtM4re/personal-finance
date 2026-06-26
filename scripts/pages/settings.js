/* ============================================================
   settings.js — Settings page
   ============================================================ */

/* ---- Custom categories ---- */
const CAT_TYPE_LABEL = { expense: 'Expense', income: 'Income', both: 'Income & expense' };
/* category icons come from the Lucide picker (see icons.js) */
let editingCatId = null;

async function renderCustomCats() {
  const cats    = await SettingsStore.getCustomCategories();
  const listEl  = document.getElementById('customCatsList');
  const divider = document.getElementById('customCatsDivider');
  if (!listEl) return;

  if (cats.length === 0) {
    listEl.innerHTML = '';
    if (divider) divider.style.display = 'none';
    return;
  }
  if (divider) divider.style.display = '';

  listEl.innerHTML = cats.map(c => `
    <div class="settings-row" style="gap:10px;">
      <span style="width:32px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:var(--color-text-muted);">${categoryIconHTML(c, 18)}</span>
      <div class="settings-row__info">
        <div class="settings-row__title">${escapeHTML(c.name)}</div>
        <div class="settings-row__sub">${CAT_TYPE_LABEL[c.type] || escapeHTML(c.type)}</div>
      </div>
      <button type="button" class="btn btn--ghost btn--sm edit-cat-btn" data-id="${escapeHTML(c.id)}" style="flex-shrink:0;">Edit</button>
      <button type="button" class="btn btn--ghost btn--sm del-cat-btn" data-id="${escapeHTML(c.id)}" style="flex-shrink:0;color:var(--color-expense);">Remove</button>
    </div>
    <div class="settings-divider"></div>
  `).join('');

  listEl.querySelectorAll('.edit-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cats = await SettingsStore.getCustomCategories();
      const cat  = cats.find(c => c.id === btn.dataset.id);
      if (!cat) return;
      editingCatId = cat.id;
      document.getElementById('newCatName').value = cat.name;
      renderIconPicker(document.getElementById('newCatIconGrid'), document.getElementById('newCatIcon'), cat.lucide);
      document.getElementById('newCatType').value = cat.type || 'expense';
      document.getElementById('addCatBtn').textContent = 'Update';
      document.getElementById('cancelEditCatBtn').style.display = '';
      document.getElementById('newCatName').focus();
    });
  });

  listEl.querySelectorAll('.del-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteCatModal(btn.dataset.id));
  });
}

function resetCatForm() {
  editingCatId = null;
  document.getElementById('newCatName').value = '';
  renderIconPicker(document.getElementById('newCatIconGrid'), document.getElementById('newCatIcon'));
  document.getElementById('newCatType').value = 'expense';
  document.getElementById('addCatBtn').textContent = 'Add';
  document.getElementById('cancelEditCatBtn').style.display = 'none';
}

async function saveCustomCat() {
  const name = document.getElementById('newCatName')?.value.trim().slice(0, 30);
  const lucide = document.getElementById('newCatIcon')?.value.trim() || 'tag';
  const type = document.getElementById('newCatType')?.value || 'expense';
  if (!name) { showToast('Enter a category name', 'error'); return; }

  /* duplicate guard against defaults + other customs (case-insensitive) */
  const all = await CategoryStore.getAll();
  if (all.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCatId)) {
    showToast(`A category named “${name}” already exists`, 'error');
    return;
  }

  const cats = await SettingsStore.getCustomCategories();
  if (editingCatId) {
    const cat = cats.find(c => c.id === editingCatId);
    if (cat) { cat.name = name; cat.lucide = lucide; delete cat.icon; cat.type = type; }
    await SettingsStore.setCustomCategories(cats);
    showToast('Category updated', 'success');
  } else {
    cats.push({ id: 'custom-' + Date.now().toString(36), name, lucide, type });
    await SettingsStore.setCustomCategories(cats);
    showToast('Category added', 'success');
  }
  resetCatForm();
  await renderCustomCats();
}

async function openDeleteCatModal(id) {
  const modal   = document.getElementById('deleteCatModal');
  const msgEl   = document.getElementById('deleteCatMsg');
  const confirm = document.getElementById('confirmDeleteCat');
  if (!modal || !confirm) return;

  const cats = await SettingsStore.getCustomCategories();
  const cat  = cats.find(c => c.id === id);
  if (!cat) return;

  let used = 0;
  try { used = (await TransactionStore.getAll()).filter(t => t.categoryId === id).length; } catch (_) {}
  msgEl.textContent = used
    ? `${used} transaction${used !== 1 ? 's' : ''} use${used === 1 ? 's' : ''} “${cat.name}”. They will keep their data but show as Uncategorized. This cannot be undone.`
    : `“${cat.name}” will be removed. This cannot be undone.`;

  modal.classList.add('open');
  confirm.onclick = async () => {
    confirm.disabled = true;
    try {
      await SettingsStore.setCustomCategories(cats.filter(c => c.id !== id));
      /* drop any budget limits set for this category across all months */
      const budgets = await SettingsStore.getBudgets();
      let changed = false;
      for (const m of Object.keys(budgets)) {
        if (budgets[m] && budgets[m][id] !== undefined) { delete budgets[m][id]; changed = true; }
      }
      if (changed) await SettingsStore.setBudgets(budgets);
      if (editingCatId === id) resetCatForm();
      showToast('Category removed', 'success');
      await renderCustomCats();
    } catch (err) {
      showToast(err.message || 'Failed to remove category', 'error');
    } finally {
      modal.classList.remove('open');
      confirm.disabled = false;
    }
  };
  document.getElementById('cancelDeleteCat')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
  document.getElementById('closeDeleteCatModal')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  await SettingsStore.hydrateLocalDefaults();   /* pull synced job/account defaults */

  const emailEl = document.getElementById('userEmail');
  if (emailEl) emailEl.textContent = user.email;

  /* Load counts */
  try {
    const [txs, accs] = await Promise.all([
      TransactionStore.getAll(),
      AccountStore.getAll(),
    ]);
    const txEl  = document.getElementById('txCount');
    const accEl = document.getElementById('accCount');
    if (txEl)  txEl.textContent  = `${txs.length} transaction${txs.length !== 1 ? 's' : ''}`;
    if (accEl) accEl.textContent = `${accs.length} account${accs.length !== 1 ? 's' : ''}`;
  } catch (_) {}

  /* Currency selector */
  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect) {
    SettingsStore.getCurrency().then(c => { currencySelect.value = c; });
    currencySelect.addEventListener('change', async () => {
      await SettingsStore.setCurrency(currencySelect.value);
      showToast('Currency updated', 'success');
    });
  }

  /* Default account + Job defaults (local convenience) */
  try {
    const accounts  = await AccountStore.getAll();
    const accOpts   = (placeholder) => `<option value="">${placeholder}</option>` +
      accounts.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('');

    const defSel = document.getElementById('defaultAccountSelect');
    if (defSel) {
      defSel.innerHTML = accOpts('— None —');
      defSel.value = AccountStore.getDefaultId();
      defSel.addEventListener('change', () => {
        AccountStore.setDefaultId(defSel.value);
        showToast('Default account saved', 'success');
      });
    }

    const job = ShiftStore.getJobDefaults();
    const jobRate     = document.getElementById('jobRate');
    const jobAccSel   = document.getElementById('jobAccountSelect');

    const jobs   = await JobStore.getAll();
    const jobSel = document.getElementById('jobDefaultSelect');
    if (jobSel) {
      jobSel.innerHTML = '<option value="">— None —</option>' +
        jobs.map(j => `<option value="${j.id}">${escapeHTML(j.name)}</option>`).join('');
      jobSel.value = JobStore.getDefaultId();
      jobSel.addEventListener('change', () => {
        JobStore.setDefaultId(jobSel.value);
        const j = jobs.find(x => x.id === jobSel.value);
        if (j) {
          /* mirror the job's defaults into the legacy job-defaults so the rate
             + deposit rows reflect it and old consumers keep working */
          ShiftStore.setJobDefaults({ employer: j.name, rate: j.rate, accountId: j.accountId || '' });
          if (jobRate)   jobRate.value   = j.rate || '';
          if (jobAccSel) jobAccSel.value = j.accountId || '';
        }
        showToast('Default job saved', 'success');
      });
    }
    if (jobRate) {
      jobRate.value = job.rate || '';
      jobRate.addEventListener('change', () => {
        ShiftStore.setJobDefaults({ rate: parseFloat(jobRate.value) || 0 });
        showToast('Job defaults saved', 'success');
      });
    }
    if (jobAccSel) {
      jobAccSel.innerHTML = accOpts('— None —');
      jobAccSel.value = job.accountId;
      jobAccSel.addEventListener('change', () => {
        ShiftStore.setJobDefaults({ accountId: jobAccSel.value });
        showToast('Job defaults saved', 'success');
      });
    }
  } catch (_) {}

  /* CSV export */
  document.getElementById('exportCsvBtn')?.addEventListener('click', async () => {
    try {
      await CSVService.export();
      showToast('CSV downloaded', 'success');
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    }
  });

  /* CSV import */
  document.getElementById('importCsvInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { imported, skipped } = await CSVService.import(file);
      showToast(`Imported ${imported} transaction${imported !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`, 'success');
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    }
    e.target.value = '';
  });

  /* Custom categories */
  await renderCustomCats();
  document.getElementById('addCatBtn')?.addEventListener('click', saveCustomCat);
  document.getElementById('cancelEditCatBtn')?.addEventListener('click', resetCatForm);

  /* Enter in the name input saves */
  document.getElementById('newCatName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveCustomCat(); }
  });

  /* Lucide icon picker fills the hidden icon field */
  renderIconPicker(document.getElementById('newCatIconGrid'), document.getElementById('newCatIcon'));

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await SupaAuth.signOut();
  });

  document.getElementById('deleteDataBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('deleteAllModal');
    if (!modal) return;
    modal.classList.add('open');
    document.getElementById('confirmDeleteAll').onclick = async () => {
      const btn = document.getElementById('confirmDeleteAll');
      btn.classList.add('btn--loading'); btn.disabled = true;
      try {
        await sb.from('transactions').delete().eq('user_id', user.id);
        await sb.from('subscriptions').delete().eq('user_id', user.id);     /* no-op if table not created yet */
        await sb.from('accounts').delete().eq('user_id', user.id);
        await SettingsStore.setBudgets({});
        await SettingsStore.setSubscriptions([]);
        await SettingsStore.setCustomCategories([]);
        showToast('All data deleted.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to delete data.', 'error');
      } finally {
        modal.classList.remove('open');
        btn.classList.remove('btn--loading'); btn.disabled = false;
      }
    };
    document.getElementById('cancelDeleteAll')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
    document.getElementById('closeDeleteAllModal')?.addEventListener('click', () => modal.classList.remove('open'), { once: true });
  });
});
