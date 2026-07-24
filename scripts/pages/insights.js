/* ============================================================
   insights.js (page) — app-wide spending insights feed.
   Pure detection lives in scripts/engine/insights.js
   (InsightsEngine.generateInsights). This file just renders.
   ============================================================ */

const ICON = {
  up:     '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  down:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>',
  spike:  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  repeat: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
};

/* current page is under /pages/, so siblings resolve directly */
function copyFor(ins, catName) {
  switch (ins.kind) {
    case 'spendTrend':
      return {
        icon: ins.diff > 0 ? ICON.down : ICON.up,
        title: ins.diff > 0 ? 'Spending is up this month' : 'Spending is down this month',
        text: `You've spent ${formatCurrency(ins.current)} so far this month — ${formatCurrency(Math.abs(ins.diff))} (${ins.pct}%) ${ins.diff > 0 ? 'more' : 'less'} than last month (${formatCurrency(ins.previous)}).`,
      };
    case 'categorySpike':
      return {
        icon: ICON.spike,
        title: `${escapeHTML(catName(ins.categoryId))} spiked`,
        text: `${escapeHTML(catName(ins.categoryId))} is ${formatCurrency(ins.current)} this month — ${ins.pct}% above its 3-month average of ${formatCurrency(ins.avg)}.`,
      };
    case 'savingsRate':
      return {
        icon: ins.tone === 'up' ? ICON.up : ICON.down,
        title: ins.tone === 'up' ? "You're saving more" : "You're saving less",
        text: `Your savings rate is ${Math.round(ins.rate * 100)}% this month, vs ${Math.round(ins.prevRate * 100)}% last month.`,
      };
    case 'untrackedRecurring':
      return {
        icon: ICON.repeat,
        title: 'Possible untracked subscription',
        text: `<strong>${escapeHTML(ins.name)}</strong> looks recurring — about ${formatCurrency(ins.amount)} every ${ins.cadenceDays} days, logged ${ins.count} times. <a href="/subscriptions">Track it →</a>`,
      };
    default:
      return null;
  }
}

function insightCardHTML(ins, catName) {
  const c = copyFor(ins, catName);
  if (!c) return '';
  return `
    <div class="insight-card insight-card--${ins.tone}">
      <span class="insight-card__icon">${c.icon}</span>
      <div class="insight-card__body">
        <div class="insight-card__title">${c.title}</div>
        <div class="insight-card__text">${c.text}</div>
      </div>
    </div>`;
}

async function renderInsights() {
  const listEl = document.getElementById('insightsList');
  if (!listEl) return;

  const [txs, cats, subs] = await Promise.all([
    TransactionStore.getAll(),
    CategoryStore.getAll(),
    SubscriptionStore.getAll().catch(() => []),
  ]);

  const catName = id => (cats.find(c => c.id === id)?.name) || 'Uncategorized';
  const insights = InsightsEngine.generateInsights(txs, { subscriptions: subs });

  const subEl = document.getElementById('insightsSub');
  if (subEl) {
    subEl.textContent = insights.length
      ? `${insights.length} thing${insights.length === 1 ? '' : 's'} worth a look this month.`
      : 'Notable patterns and changes in your spending.';
  }

  if (!insights.length) {
    listEl.innerHTML = `
      <div class="insights-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity:.3;margin-bottom:10px"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>
        <div class="insights-empty__title">Nothing notable right now</div>
        <div class="insights-empty__text">Insights appear as you log transactions across a few months — spending spikes, savings-rate shifts, and recurring charges you aren't tracking yet.</div>
      </div>`;
    return;
  }

  listEl.innerHTML = insights.map(i => insightCardHTML(i, catName)).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  try {
    await renderInsights();
  } catch (err) {
    console.error('Insights error:', err);
    showErrorState('insightsList', "Couldn't load insights. " + (err.message || ''), () => location.reload());
  }
});
