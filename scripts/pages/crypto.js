/* ============================================================
   crypto.js (page) — read-only crypto wallet balances.
   Public addresses only; never handles keys/seeds. See
   scripts/data/crypto.js for the security model and storage.
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

async function renderCryptoPage() {
  const listEl  = document.getElementById('cryptoList');
  const totalEl = document.getElementById('cryptoTotal');
  const countEl = document.getElementById('cryptoWalletCount');
  const curEl   = document.getElementById('cryptoCurrency');
  if (!listEl) return;

  let wallets;
  try { wallets = await CryptoStore.getAll(); }
  catch (e) { listEl.innerHTML = `<div style="padding:20px 16px;color:var(--color-expense);font-size:.8rem;">${escapeHTML(e.message || 'Failed to load wallets')}</div>`; return; }

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

  const snap = await CryptoBalances.snapshot(wallets);
  curEl.textContent = snap.currency;
  listEl.innerHTML = snap.items.map(r => walletRowHTML(r.wallet, r)).join('');
  wireRowActions(listEl);
  totalEl.textContent = formatCurrency(snap.total) + (snap.anyMissing ? ' +' : '');
}

function walletRowHTML(w, result) {
  const chain = CHAINS[w.chain] || { symbol: '?', label: w.chain, color: 'var(--color-text)' };
  let right;
  if (!result) {
    right = `<div class="crypto-sub">…</div>`;
  } else if (result.error) {
    right = `<div style="font-size:.72rem;color:var(--color-expense);text-align:right;max-width:120px;">${escapeHTML(result.error)}</div>`;
  } else {
    const fiat = result.fiat != null ? formatCurrency(result.fiat) : '—';
    right = `
      <div style="text-align:right;">
        <div class="crypto-amt" style="font-size:.95rem;">${fiat}</div>
        <div class="crypto-sub">${formatCoin(result.amount, w.chain)}</div>
      </div>`;
  }
  return `
    <div class="crypto-row" style="--chain:${chain.color};" data-id="${w.id}">
      <div class="crypto-badge">${chain.symbol}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.875rem;font-weight:600;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(w.label)} <span style="color:var(--color-text-muted);font-weight:400;font-size:.78rem;">· ${chain.label}</span></div>
        <div class="crypto-addr">${escapeHTML(maskAddress(w.addresses))}</div>
      </div>
      ${right}
      <button class="crypto-row__del" data-id="${w.id}" aria-label="Remove wallet">✕</button>
    </div>`;
}

function wireRowActions(container) {
  container.querySelectorAll('.crypto-row__del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const w = (await CryptoStore.getAll()).find(x => x.id === btn.dataset.id);
      if (!w) return;
      if (!confirm(`Remove "${w.label}"? This only removes it from this view — your wallet and funds are untouched.`)) return;
      try {
        await CryptoStore.remove(btn.dataset.id);
        await renderCryptoPage();
        showToast('Wallet removed', 'success');
      } catch (e) { showToast(e.message || 'Failed to remove', 'error'); }
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

  const submit = async () => {
    const chain = chainEl.value;
    const check = CryptoBalances.validateAddress(chain, addrEl.value);
    if (!check.ok) { showError(check.error); return; }
    addBtn.disabled = true;
    try {
      await CryptoStore.add({ label: labelEl.value, chain, addresses: [check.value] });
      labelEl.value = '';
      addrEl.value = '';
      showError('');
      await renderCryptoPage();
      showToast('Wallet added', 'success');
    } catch (e) {
      showError(e.message || 'Failed to add wallet');
    } finally {
      addBtn.disabled = false;
    }
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
    renderCryptoPage();
  });
});
