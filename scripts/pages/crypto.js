/* ============================================================
   crypto.js (page) — read-only crypto wallet balances.
   Public addresses only; never handles keys/seeds. See
   scripts/data/crypto.js for the security model.
   ============================================================ */

function maskAddress(addresses) {
  if (addresses.length > 1) return `${addresses.length} addresses`;
  const a = addresses[0] || '';
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function formatCoin(amount, chain) {
  const d = CHAINS[chain]?.decimals ?? 8;
  const s = amount.toFixed(d).replace(/\.?0+$/, '');
  return `${s} ${CHAINS[chain]?.symbol || ''}`;
}

let _priceCache = null;

async function renderCryptoPage() {
  const listEl  = document.getElementById('cryptoList');
  const totalEl = document.getElementById('cryptoTotal');
  const countEl = document.getElementById('cryptoWalletCount');
  const curEl   = document.getElementById('cryptoCurrency');
  if (!listEl) return;

  const wallets = CryptoStore.getAll();
  countEl.textContent = `${wallets.length} wallet${wallets.length === 1 ? '' : 's'}`;

  if (!wallets.length) {
    totalEl.textContent = formatCurrency(0);
    listEl.innerHTML = `
      <div style="padding:36px 24px;text-align:center;color:var(--color-text-muted);">
        <div style="font-size:.9375rem;font-weight:600;color:var(--color-text);margin-bottom:6px;">No wallets yet</div>
        <div style="font-size:.8125rem;line-height:1.6;">Add a Bitcoin or Solana <strong>public address</strong> above to see its live balance.</div>
      </div>`;
    return;
  }

  /* loading state */
  listEl.innerHTML = wallets.map(w => walletRowHTML(w, null)).join('');
  totalEl.textContent = '…';

  /* prices + balances in parallel */
  let prices;
  try {
    prices = _priceCache = await CryptoBalances.prices();
    curEl.textContent = prices.currency;
  } catch {
    prices = _priceCache || { currency: (localStorage.getItem('pf_currency') || 'CAD'), map: {} };
  }

  const results = await Promise.all(wallets.map(async (w) => {
    try {
      const amount = await CryptoBalances.walletAmount(w);
      const price  = prices.map[w.chain];
      const fiat   = price != null ? amount * price : null;
      return { w, amount, fiat, error: null };
    } catch (e) {
      return { w, amount: null, fiat: null, error: e.message || 'Lookup failed' };
    }
  }));

  listEl.innerHTML = results.map(r => walletRowHTML(r.w, r)).join('');
  wireRowActions(listEl);

  const total = results.reduce((s, r) => s + (r.fiat || 0), 0);
  const anyMissing = results.some(r => r.fiat == null);
  totalEl.textContent = formatCurrency(total) + (anyMissing ? ' +' : '');
}

function walletRowHTML(w, result) {
  const chain = CHAINS[w.chain] || { symbol: '?', label: w.chain, color: 'var(--color-text)' };
  let right;
  if (!result) {
    right = `<div style="font-size:.8rem;color:var(--color-text-muted);">…</div>`;
  } else if (result.error) {
    right = `<div style="font-size:.72rem;color:var(--color-expense);text-align:right;max-width:120px;">${escapeHTML(result.error)}</div>`;
  } else {
    const fiat = result.fiat != null ? formatCurrency(result.fiat) : '—';
    right = `
      <div style="text-align:right;">
        <div class="font-display" style="font-size:.95rem;font-weight:700;color:var(--color-text);">${fiat}</div>
        <div class="font-display" style="font-size:.72rem;color:var(--color-text-muted);">${formatCoin(result.amount, w.chain)}</div>
      </div>`;
  }
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--color-border-light);" data-id="${w.id}">
      <div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid var(--color-border);font-family:var(--font-display);font-size:.66rem;font-weight:700;color:${chain.color};flex-shrink:0;">${chain.symbol}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.875rem;font-weight:600;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(w.label)} <span style="color:var(--color-text-muted);font-weight:400;font-size:.78rem;">· ${chain.label}</span></div>
        <div class="font-display" style="font-size:.72rem;color:var(--color-text-muted);">${escapeHTML(maskAddress(w.addresses))}</div>
      </div>
      ${right}
      <button class="cw-del" data-id="${w.id}" aria-label="Remove wallet" style="flex-shrink:0;background:none;border:none;color:var(--color-text-muted);cursor:pointer;font-size:1rem;line-height:1;padding:4px;">✕</button>
    </div>`;
}

function wireRowActions(container) {
  container.querySelectorAll('.cw-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = CryptoStore.getAll().find(x => x.id === btn.dataset.id);
      if (!w) return;
      if (!confirm(`Remove "${w.label}"? This only removes it from this view — your wallet and funds are untouched.`)) return;
      CryptoStore.remove(btn.dataset.id);
      renderCryptoPage();
      showToast('Wallet removed', 'success');
    });
  });
}

function wireAddForm() {
  const chainEl   = document.getElementById('cwChain');
  const labelEl   = document.getElementById('cwLabel');
  const addrEl    = document.getElementById('cwAddress');
  const errEl     = document.getElementById('cwError');
  const btcHintEl = document.getElementById('cwBtcHint');
  const addBtn    = document.getElementById('cwAddBtn');

  const showError = (msg) => {
    errEl.textContent = msg;
    errEl.style.display = msg ? '' : 'none';
  };
  const syncHint = () => { btcHintEl.style.display = chainEl.value === 'btc' ? '' : 'none'; };
  chainEl.addEventListener('change', () => { syncHint(); showError(''); });
  addrEl.addEventListener('input', () => showError(''));
  syncHint();

  const submit = () => {
    const chain = chainEl.value;
    const check = CryptoBalances.validateAddress(chain, addrEl.value);
    if (!check.ok) { showError(check.error); return; }
    CryptoStore.add({ label: labelEl.value, chain, addresses: [check.value] });
    labelEl.value = '';
    addrEl.value = '';
    showError('');
    renderCryptoPage();
    showToast('Wallet added', 'success');
  };

  addBtn.addEventListener('click', submit);
  addrEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await SupaAuth.requireAuth();
  if (!user) return;
  wireAddForm();
  renderCryptoPage();
  document.getElementById('cryptoRefresh')?.addEventListener('click', (e) => {
    e.preventDefault();
    _priceCache = null;
    renderCryptoPage();
  });
});
