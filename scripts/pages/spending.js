/* ============================================================
   spending.js — Spending / Income analysis (toggle between the two)
   ============================================================ */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let currentMonth = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
let mode = 'expense';  /* 'expense' (Spending) | 'income' (Income) */

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function getMonthPrefix(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-`;
}

function updateMonthNav() {
  const el = document.getElementById('monthNavLabel');
  if (el) el.textContent = `${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}`;
}

async function renderSpending() {
  updateMonthNav();

  const isIncome = mode === 'income';

  /* Panel titles reflect the active mode (topbar stays "Cash Flow") */
  setText('catTitle',   isIncome ? 'Income by Category' : 'Spending by Category');
  setText('trendTitle', isIncome ? 'Income Trend'       : 'Spending Trend');

  const allTx = await TransactionStore.getAll();
  const prefix = getMonthPrefix(currentMonth.year, currentMonth.month);
  const monthTx = allTx.filter(t => t.date.startsWith(prefix));

  const totals = SummaryEngine.getTotals(monthTx);
  const net = totals.income - totals.expense;

  setText('spendTotal',  formatCurrency(totals.expense));
  setText('spendIncome', formatCurrency(totals.income));
  setText('spendNet',    (net >= 0 ? '+' : '') + formatCurrency(net));
  const netEl = document.getElementById('spendNet');
  if (netEl) netEl.style.color = net >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  /* Category donut for the active type */
  const byCategory = SummaryEngine.getByCategory(monthTx, mode);
  const catEmpty = document.getElementById('categoryChartEmpty');
  const breakdownEl = document.getElementById('spendingBreakdown');
  const amtColor = isIncome ? 'var(--color-income)' : 'var(--color-expense)';

  if (catEmpty) catEmpty.querySelector('span').textContent = isIncome ? 'No income this period.' : 'No expenses this period.';

  if (byCategory.length > 0) {
    catEmpty?.setAttribute('hidden', '');
    const catObjects = await Promise.all(byCategory.map(b => CategoryStore.getById(b.categoryId)));
    const slices = byCategory.map((b, i) => ({
      label: escapeHTML(catObjects[i]?.name) || 'Other',
      value: b.total,
      cat:   catObjects[i],
    }));

    Charts.drawDonutChart('categoryCanvas', slices, false, isIncome ? 'Total earned' : 'Total spent');

    const total = slices.reduce((s, sl) => s + sl.value, 0);
    const barHTML = slices.map((sl, i) => {
      const pct = total > 0 ? Math.round((sl.value / total) * 100) : 0;
      return `
        <div class="spending-item">
          <div class="spending-item__icon">${categoryIconHTML(sl.cat, 18)}</div>
          <div class="spending-item__info">
            <div class="spending-item__name">${sl.label}</div>
            <div class="spending-item__bar-wrap">
              <div class="spending-item__bar" style="width:${pct}%;background:${Charts.COLORS[i % Charts.COLORS.length]}"></div>
            </div>
          </div>
          <div class="spending-item__meta">
            <div class="spending-item__amount" style="color:${amtColor}">${formatCurrency(sl.value)}</div>
            <div class="spending-item__pct">${pct}%</div>
          </div>
        </div>`;
    }).join('');

    if (breakdownEl) breakdownEl.innerHTML = barHTML;
  } else {
    catEmpty?.removeAttribute('hidden');
    if (breakdownEl) breakdownEl.innerHTML = `<div class="empty-state">No ${isIncome ? 'income' : 'expenses'} this month.</div>`;
  }

  /* Monthly trend bar chart for the selected year */
  const year = parseInt(document.getElementById('trendYear')?.value || new Date().getFullYear());
  const monthly = SummaryEngine.getMonthlyRollup(allTx, year);
  const trendEmpty = document.getElementById('trendChartEmpty');
  if (trendEmpty) trendEmpty.querySelector('span').textContent = isIncome ? 'No income data yet.' : 'No expense data yet.';
  const hasData = monthly.some(m => (isIncome ? m.income : m.expense) > 0);
  if (hasData) {
    trendEmpty?.setAttribute('hidden', '');
    const bars = monthly.map(m => isIncome
      ? ({ label: m.label, income: m.income, expense: 0 })
      : ({ label: m.label, income: 0, expense: m.expense }));
    if (year === new Date().getFullYear()) bars[new Date().getMonth()].highlight = true;
    Charts.drawBarChart('trendCanvas', bars);
  } else {
    trendEmpty?.removeAttribute('hidden');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;

  /* Populate year options */
  const yearSel = document.getElementById('trendYear');
  if (yearSel) {
    const currentYear = new Date().getFullYear();
    yearSel.innerHTML = [currentYear, currentYear - 1, currentYear - 2]
      .map(y => `<option value="${y}">${y}</option>`).join('');
  }

  try {
    await renderSpending();
  } catch (err) {
    console.error('Spending page error:', err);
    showErrorState('spendingBreakdown', "Couldn't load your cash flow. " + (err.message || ''), () => location.reload());
  }

  /* Spending / Income toggle */
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === mode) return;
      mode = btn.dataset.mode;
      document.querySelectorAll('.seg-btn').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderSpending().catch(console.error);
    });
  });

  document.getElementById('monthNavPrev')?.addEventListener('click', async () => {
    currentMonth.month--;
    if (currentMonth.month < 1) { currentMonth.month = 12; currentMonth.year--; }
    await renderSpending();
  });

  document.getElementById('monthNavNext')?.addEventListener('click', async () => {
    currentMonth.month++;
    if (currentMonth.month > 12) { currentMonth.month = 1; currentMonth.year++; }
    await renderSpending();
  });

  document.getElementById('trendYear')?.addEventListener('change', () => renderSpending().catch(console.error));
});
