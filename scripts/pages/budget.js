/* ============================================================
   budget.js — Monthly Budget Report page
   ============================================================ */

let currentMonth = '';

function getMonthKey() {
  const params = new URLSearchParams(window.location.search);
  return params.get('month') || new Date().toISOString().slice(0, 7);
}

function setMonthKey(m) {
  const url = new URL(window.location.href);
  url.searchParams.set('month', m);
  history.replaceState({}, '', url.toString());
  currentMonth = m;
}

function monthLabel(key) {
  const [y, mo] = key.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function prevMonthKey(key) {
  const d = new Date(key + '-01T00:00:00');
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function nextMonthKey(key) {
  const d = new Date(key + '-01T00:00:00');
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}

async function loadMonthData(monthKey) {
  const [y, mo] = monthKey.split('-').map(Number);
  const from    = `${y}-${String(mo).padStart(2, '0')}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const to      = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [txs, cats] = await Promise.all([
    TransactionStore.query({ from, to }),
    CategoryStore.getAll(),
  ]);

  const budgets = BudgetStore.getMonth(monthKey);
  const expCats = cats.filter(c => c.type === 'expense' || c.type === 'both');

  const spending = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    spending[t.categoryId] = (spending[t.categoryId] || 0) + t.amount;
  });

  return { txs, expCats, budgets, spending };
}

async function renderBudgetPage() {
  const { expCats, budgets, spending } = await loadMonthData(currentMonth);

  /* Month nav */
  document.getElementById('monthLabel').textContent = monthLabel(currentMonth);
  const today = new Date().toISOString().slice(0, 7);
  const nextBtn = document.getElementById('nextMonthBtn');
  if (nextBtn) nextBtn.disabled = currentMonth >= today;

  /* Summary */
  const totalBudget = expCats.reduce((s, c) => s + (budgets[c.id] || 0), 0);
  const totalSpent  = Object.values(spending).reduce((s, v) => s + v, 0);
  const remaining   = totalBudget - totalSpent;
  const overBudget  = remaining < 0;

  setText('summaryBudget',  formatCurrency(totalBudget));
  setText('summarySpent',   formatCurrency(totalSpent));
  const remEl = document.getElementById('summaryRemaining');
  if (remEl) {
    remEl.textContent = formatCurrency(Math.abs(remaining));
    remEl.style.color = overBudget ? 'var(--color-expense)' : remaining === 0 ? 'var(--color-text-muted)' : 'var(--color-income)';
  }
  const remLabel = document.getElementById('summaryRemainingLabel');
  if (remLabel) remLabel.textContent = overBudget ? 'Over budget' : 'Remaining';

  /* Category rows */
  const listEl = document.getElementById('budgetCategoryList');
  if (!listEl) return;

  const hasBudgets  = Object.keys(budgets).length > 0;
  const hasSpending = Object.keys(spending).length > 0;

  /* Partition categories */
  const budgeted   = expCats.filter(c => budgets[c.id] > 0).sort((a, b) => {
    const pa = (spending[a.id] || 0) / budgets[a.id];
    const pb = (spending[b.id] || 0) / budgets[b.id];
    return pb - pa;
  });
  const unbudgeted = expCats.filter(c => !budgets[c.id] && spending[c.id] > 0);
  const dormant    = expCats.filter(c => !budgets[c.id] && !spending[c.id]);

  let html = '';

  if (!hasBudgets && !hasSpending) {
    html += `
      <div class="budget-onboarding-hint">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Click <strong>Set limit</strong> on any category to define a monthly budget.
      </div>`;
  }

  if (budgeted.length) {
    html += budgeted.map(c => categoryRowHTML(c, spending[c.id] || 0, budgets[c.id])).join('');
  }

  if (unbudgeted.length) {
    html += `<div class="budget-section-label">Unbudgeted spending</div>`;
    html += unbudgeted.map(c => categoryRowHTML(c, spending[c.id], 0)).join('');
  }

  if (dormant.length) {
    if (budgeted.length || unbudgeted.length) {
      html += `<div class="budget-section-label">No activity</div>`;
    }
    html += dormant.map(c => categoryRowHTML(c, 0, 0)).join('');
  }

  listEl.innerHTML = html;

  /* Inline edit wiring */
  listEl.querySelectorAll('.budget-amount-display').forEach(el => {
    el.addEventListener('click', () => startEdit(el));
  });

  /* Copy from last month button */
  const prevKey = prevMonthKey(currentMonth);
  const prevBudgets = BudgetStore.getMonth(prevKey);
  const hasPrev     = Object.keys(prevBudgets).length > 0;

  const copyWrap = document.getElementById('copyFromPrev');
  if (copyWrap) {
    if (hasPrev && !hasBudgets) {
      copyWrap.style.display = '';
      copyWrap.querySelector('#copyBtn')?.addEventListener('click', async () => {
        await BudgetStore.copyFromPrevious(currentMonth);
        await renderBudgetPage();
        showToast('Budgets copied from last month', 'success');
      });
    } else {
      copyWrap.style.display = 'none';
    }
  }
}

function categoryRowHTML(cat, spent, budget) {
  const pct      = budget > 0 ? (spent / budget) * 100 : 0;
  const over     = budget > 0 && spent > budget;
  const barPct   = Math.min(pct, 100);
  const barColor = pct >= 100 ? 'var(--color-expense)' : pct >= 75 ? 'var(--color-transfer)' : 'var(--color-income)';

  const budgetDisplay = budget > 0
    ? `<span class="budget-amount-display" data-cat="${cat.id}" data-value="${budget}">${formatCurrency(budget)}</span>`
    : `<span class="budget-amount-display budget-amount-display--empty" data-cat="${cat.id}" data-value="0">Set limit</span>`;

  return `
    <div class="budget-row" data-cat="${cat.id}">
      <div class="budget-row__cat">
        <div class="budget-row__icon">${categoryIconHTML(cat, 18)}</div>
        <div class="budget-row__name">${cat.name}</div>
      </div>
      <div class="budget-row__bar-wrap">
        ${budget > 0 ? `
          <div class="budget-bar-track">
            <div class="budget-bar-fill" style="width:${barPct.toFixed(1)}%;background:${barColor};"></div>
          </div>
        ` : `<div class="budget-bar-empty">— no budget</div>`}
      </div>
      <div class="budget-row__numbers">
        <span class="budget-row__spent ${over ? 'budget-row__spent--over' : ''}">${formatCurrency(spent)}</span>
        <span class="budget-row__sep">of</span>
        ${budgetDisplay}
        ${budget > 0 ? `<span class="budget-row__pct" style="color:${barColor}">${Math.round(pct)}%</span>` : ''}
      </div>
    </div>
  `;
}

function startEdit(displayEl) {
  const catId   = displayEl.dataset.cat;
  const current = parseFloat(displayEl.dataset.value) || 0;

  const input = document.createElement('input');
  input.type        = 'number';
  input.className   = 'budget-inline-input';
  input.value       = current > 0 ? current : '';
  input.placeholder = '0.00';
  input.min         = '0';
  input.step        = '0.01';

  displayEl.replaceWith(input);
  input.focus();
  if (current > 0) input.select();

  const save = async () => {
    const val = parseFloat(input.value) || 0;
    await BudgetStore.set(currentMonth, catId, val);
    renderBudgetPage().catch(console.error);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); save(); }
    if (e.key === 'Escape') { renderBudgetPage().catch(console.error); }
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;

  currentMonth = getMonthKey();

  try {
    await BudgetStore.load();
    await renderBudgetPage();
  } catch (err) {
    console.error('Budget error:', err);
    showToast('Error loading budget: ' + err.message, 'error');
  }

  document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
    setMonthKey(prevMonthKey(currentMonth));
    renderBudgetPage().catch(console.error);
  });

  document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
    const next = nextMonthKey(currentMonth);
    if (next > new Date().toISOString().slice(0, 7)) return;
    setMonthKey(next);
    renderBudgetPage().catch(console.error);
  });
});
