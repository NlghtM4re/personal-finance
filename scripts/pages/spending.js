/* ============================================================
   spending.js — Spending analysis page
   ============================================================ */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let currentMonth = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

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

  /* Category donut */
  const byCategory = SummaryEngine.getByCategory(monthTx);
  const catEmpty = document.getElementById('categoryChartEmpty');
  const legendEl = document.getElementById('categoryLegend');
  const breakdownEl = document.getElementById('spendingBreakdown');

  if (byCategory.length > 0) {
    catEmpty?.setAttribute('hidden', '');
    const catObjects = await Promise.all(byCategory.map(b => CategoryStore.getById(b.categoryId)));
    const slices = byCategory.map((b, i) => ({
      label: catObjects[i]?.name || 'Other',
      value: b.total,
      icon:  catObjects[i]?.icon || '📦',
    }));

    Charts.drawDonutChart('categoryCanvas', slices);

    if (legendEl) {
      legendEl.innerHTML = slices.map((sl, i) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${Charts.COLORS[i % Charts.COLORS.length]}"></span>
          <span class="legend-label">${sl.label}</span>
          <span class="legend-amount">${formatCurrency(sl.value)}</span>
        </div>`).join('');
    }

    const total = slices.reduce((s, sl) => s + sl.value, 0);
    const barHTML = slices.map((sl, i) => {
      const pct = total > 0 ? Math.round((sl.value / total) * 100) : 0;
      return `
        <div class="spending-item">
          <div class="spending-item__icon">${sl.icon}</div>
          <div class="spending-item__info">
            <div class="spending-item__name">${sl.label}</div>
            <div class="spending-item__bar-wrap">
              <div class="spending-item__bar" style="width:${pct}%;background:${Charts.COLORS[i % Charts.COLORS.length]}"></div>
            </div>
          </div>
          <div class="spending-item__meta">
            <div class="spending-item__amount">${formatCurrency(sl.value)}</div>
            <div class="spending-item__pct">${pct}%</div>
          </div>
        </div>`;
    }).join('');

    if (breakdownEl) breakdownEl.innerHTML = barHTML;
  } else {
    catEmpty?.removeAttribute('hidden');
    if (legendEl)    legendEl.innerHTML    = '';
    if (breakdownEl) breakdownEl.innerHTML = '<div class="empty-state">No expenses this month.</div>';
  }

  /* Spending trend bar chart (monthly totals for selected year) */
  const year = parseInt(document.getElementById('trendYear')?.value || new Date().getFullYear());
  const monthly = SummaryEngine.getMonthlyRollup(allTx, year);
  const trendEmpty = document.getElementById('trendChartEmpty');
  const hasData = monthly.some(m => m.expense > 0);
  if (hasData) {
    trendEmpty?.setAttribute('hidden', '');
    const expenseOnly = monthly.map(m => ({ label: m.label, income: 0, expense: m.expense }));
    Charts.drawBarChart('trendCanvas', expenseOnly);
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
    showToast('Error loading data: ' + err.message, 'error');
  }

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
