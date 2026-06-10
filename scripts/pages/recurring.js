/* ============================================================
   recurring.js — Manage recurring transaction rules
   ============================================================ */

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const FREQ_MONTHLY_FACTOR = { daily: 30, weekly: 4.33, monthly: 1, yearly: 1 / 12 };

async function renderRecurringPage() {
  const rules = await RecurringStore.getAll();
  const cats  = await CategoryStore.getAll();
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

  const today  = new Date().toISOString().slice(0, 10);
  const active = rules.filter(r => r.active !== false);
  const due    = rules.filter(r => r.active !== false && r.nextDue <= today);

  /* Summary stats */
  setText('statActive', active.length);
  setText('statDue', due.length);
  const monthlyEst = active.reduce((s, r) => {
    if (r.type === 'expense') s -= r.amount * (FREQ_MONTHLY_FACTOR[r.frequency] || 1);
    if (r.type === 'income')  s += r.amount * (FREQ_MONTHLY_FACTOR[r.frequency] || 1);
    return s;
  }, 0);
  const netEl = document.getElementById('statMonthly');
  if (netEl) {
    netEl.textContent = (monthlyEst >= 0 ? '+' : '') + formatCurrency(Math.abs(monthlyEst));
    netEl.style.color = monthlyEst >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
  }

  /* Due section */
  const dueSection = document.getElementById('dueSection');
  const dueList    = document.getElementById('dueList');
  if (dueSection && dueList) {
    dueSection.style.display = due.length ? '' : 'none';
    dueList.innerHTML = due.map(r => ruleRowHTML(r, catMap, true)).join('');
    wireActions(dueList);
  }

  /* All rules */
  const allEl = document.getElementById('allRulesList');
  if (allEl) {
    if (rules.length === 0) {
      allEl.innerHTML = `
        <div style="padding:40px 24px;text-align:center;color:var(--color-text-muted);">
          <div style="font-size:2rem;margin-bottom:12px;">🔄</div>
          <div style="font-size:.9375rem;font-weight:600;color:var(--color-text);margin-bottom:6px;">No recurring rules yet</div>
          <div style="font-size:.8125rem;line-height:1.6;">When adding a transaction, toggle <strong>Repeat this transaction</strong> to create a recurring rule.</div>
        </div>`;
    } else {
      allEl.innerHTML = rules.map(r => ruleRowHTML(r, catMap, false)).join('');
      wireActions(allEl);
    }
  }
}

function ruleRowHTML(rule, catMap, compact) {
  const cat  = catMap[rule.categoryId];
  const icon = cat?.icon || '📦';
  const name = escapeHTML(rule.note) || escapeHTML(cat?.name) || 'Transaction';
  const freq = FREQ_LABEL[rule.frequency] || rule.frequency;
  const paused = rule.active === false;
  const today  = new Date().toISOString().slice(0, 10);
  const isOver = rule.nextDue < today;

  return `
    <div class="recurring-item" data-id="${rule.id}" style="border-radius:0;border:none;border-bottom:1px solid var(--color-border-light);">
      <div class="recurring-item__icon">${icon}</div>
      <div class="recurring-item__info">
        <div class="recurring-item__name">${name}${paused ? ' <span style="font-size:.7rem;color:var(--color-text-muted);font-weight:400;">(paused)</span>' : ''}</div>
        <div class="recurring-item__meta">
          ${freq} · next due <span style="color:${isOver && !paused ? '#f59e0b' : 'inherit'}">${formatDate(rule.nextDue)}</span>
          ${rule.endDate ? ` · ends ${formatDate(rule.endDate)}` : ''}
        </div>
      </div>
      <div class="recurring-item__amount tx-amount--${rule.type}">${rule.type === 'income' ? '+' : '−'}${formatCurrency(rule.amount)}</div>
      <div class="recurring-item__actions" style="opacity:1;">
        ${!paused && rule.nextDue <= new Date().toISOString().slice(0,10) ? `<button class="btn btn--primary btn--sm rec-log-btn" data-id="${rule.id}">Log</button>` : ''}
        <button class="btn btn--ghost btn--sm rec-toggle-btn" data-id="${rule.id}">${paused ? 'Resume' : 'Pause'}</button>
        <button class="btn btn--ghost btn--sm rec-del-btn" data-id="${rule.id}" style="color:var(--color-expense);">Delete</button>
      </div>
    </div>`;
}

function wireActions(container) {
  container.querySelectorAll('.rec-log-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.id;
      const rule = (await RecurringStore.getAll()).find(r => r.id === id);
      if (!rule) return;
      btn.disabled = true;
      try {
        await TransactionStore.add({
          date:        new Date().toISOString().slice(0, 10),
          amount:      rule.amount,
          type:        rule.type,
          categoryId:  rule.categoryId,
          accountId:   rule.accountId,
          toAccountId: rule.toAccountId || null,
          note:        rule.note || '',
          tags:        rule.tags || [],
        });
        await RecurringStore.advanceNext(id);
        showToast('Transaction logged', 'success');
        renderRecurringPage();
      } catch (err) {
        showToast(err.message || 'Failed to log', 'error');
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.rec-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await RecurringStore.toggle(btn.dataset.id);
      renderRecurringPage();
    });
  });

  container.querySelectorAll('.rec-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this recurring rule? Existing logged transactions are not affected.')) return;
      await RecurringStore.remove(btn.dataset.id);
      renderRecurringPage();
      showToast('Rule deleted', 'success');
    });
  });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  renderRecurringPage();
});
