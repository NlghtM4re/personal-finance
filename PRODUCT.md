# Product

## Register

product

## Users

Solo user managing personal finances. Opens the app daily or weekly to log transactions, check balances, and review spending against budgets. Technically comfortable — expects a tool, not a tutorial. Primary tasks: add a transaction, check the balance, see where money went this month.

## Product Purpose

A personal finance tracker built for one person. Replaces spreadsheets or forgotten bank-app tabs with a single place to record income, expenses, and transfers across accounts, visualize monthly spending by category, and set budget limits that actually get checked. Success means the user can open the app, know their financial state in seconds, and log a new transaction without friction.

## Brand Personality

Sharp, precise, self-contained. The aesthetic of a pro tool — no fluff, no motivational copy, no illustrations. Data is the hero. Every UI element is there because it carries information.

Three words: **precise, minimal, fast**.

## Anti-references

- **Mint / YNAB**: bubbly consumer finance apps with rounded corners everywhere, bright gradients, and emoji-filled illustrations. This app is for someone who finds those condescending.
- **Generic SaaS dashboards**: navy + white card grids indistinguishable from every other admin panel. Color should mean something; here green = income, red = expense, teal = key figure.

## Design Principles

1. **Data first** — every pixel that doesn't carry a number, label, or affordance is a candidate for removal. Charts are navigation, not decoration.
2. **Color is semantic, not aesthetic** — green means money in, red means money out, teal marks the figure that matters most. Decorative color use dilutes the signal.
3. **Zero friction on the primary action** — adding a transaction should feel like typing in a terminal: quick, keyboard-driven, no confirmation dialogs for non-destructive actions.
4. **Expert defaults** — the interface assumes the user knows what accounts and categories are. Onboarding is for first run only; after that, get out of the way.
5. **Speed is respect** — animations that delay the user are wrong. Motion exists to orient (what changed, where it went), not to entertain.

## Accessibility & Inclusion

WCAG AA. Keyboard navigation throughout. Sufficient contrast for body text (≥4.5:1). Color is never the sole carrier of meaning — income/expense are also labeled and positioned.

---

## Current State (as of 2026-06-16)

### Pages

- **Dashboard** (`index.html`) — hero balance card (total balance + month income/expense + two net-change cells whose windows adapt to account age, so they always show distinct periods — e.g. 90 days vs 1 year, or a shorter span vs "All time" on a young account), balance-over-time line chart with range selector, monthly bar chart with week-navigation, recent transactions list, asset/debt account groups, crypto holdings panels, and a cash-flow forecast card (30-day projected balance with a low-balance warning and a dashed projection + variance band on the chart; forecasting math lives in the pure, tested `scripts/engine/insights.js`).
- **Accounts & Transactions** (`pages/accounts.html`) — left panel: compact account rows with avatar, balance, inline edit/delete; net worth card with assets/debts bar and summary. Right panel: stat chips (count, income, expenses, net), search + type/category filters, full paginated transaction list with edit/delete per row.
- **Cash Flow** (`pages/spending.html`) — month navigator, summary strip (spent/income/net), a Spending/Income segmented toggle that re-renders one balanced panel: category donut (center "Total spent"/"Total earned") + ranked breakdown, plus a monthly trend chart. Replaces the separate Spending and Income pages.
- **Budget** (`pages/budget.html`) — month navigator, summary strip (total budget / spent / over budget), per-category rows with inline editable budget limit, spend vs. limit progress bar, over-budget / unbudgeted sections. Budget onboarding shown when no data exists.
- **Add Transaction** (`pages/add-transaction.html`) — type toggle (expense/income/transfer), amount with currency prefix, date, account select, note, tags, category picker. Doubles as edit form when `?id=` is present; delete via confirmation modal.
- **Crypto** (`pages/crypto.html`) — read-only crypto wallet balances (BTC + SOL). Paste a **public address** only; the app fetches the live balance from keyless public APIs (Blockstream / publicnode RPC), converts to the user's currency (CoinGecko), and shows it in the Flow style. Never accepts a private key or seed phrase; never signs or sends. Supports multiple addresses per wallet (BTC HD wallets rotate receive addresses). Balance/price lookups auto-retry on transient failures and fall back to a cached last-known value (shown with a "last known" hint) so a flaky first load no longer needs a manual refresh; live API hosts bypass the service worker so balances are never served stale from cache. Wallets sync via the Supabase `crypto_wallets` table (localStorage fallback until the schema is run). The holdings total folds into **net worth** on the Dashboard (per-wallet panels + "Net worth · cash + crypto" line) and Accounts ("incl. $X crypto") — never into the cash balance.
- **Settings** (`pages/settings.html`) — account email, transaction/account counts, currency selector, delete-all-data via confirmation modal, sign out.

### Architecture

- Static HTML/CSS/JS — no build step, no framework.
- Supabase backend: `transactions`, `accounts`, `subscriptions`, `crypto_wallets` tables per user, plus a `user_settings` blob (currency, budgets, custom categories). Auth via `SupaAuth` wrapper (email/password).
- Data layer in `scripts/data/store.js`: `TransactionStore`, `AccountStore`, `CategoryStore`, `BudgetStore`, `SubscriptionStore`, `SettingsStore`, plus `CSVService` and the currency/date formatters (crypto stores live in `crypto.js`).
- Categories: hardcoded defaults + user **custom categories** (add/edit/icon/delete), persisted in the `user_settings` blob. `SubscriptionStore` is table-first with a settings-blob fallback that migrates into rows once the table exists.
- Charts: most charts are hand-rolled canvas in `scripts/components/charts.js` (line, donut, bar). The subscriptions analytics page additionally uses **Chart.js** (CDN). Summary math in `scripts/engine/summary.js`.
- Centralized nav in `scripts/components/nav.js` (`NAV_ITEMS` → sidebar, topbar, bottom nav, Money hub). Shared UI (theme, sidebar, toasts, PWA SW registration) in `scripts/components/ui.js`.

### Design System — "Flow" (crypto-wallet mono, since 2026-06-13)

- **Fonts**: Inter for UI (`--font-body`), **JetBrains Mono** for all money/figures (`--font-display`). `tabular-nums` on body.
- **Single theme — true black**: bg `#000`, surface `#0d0d0f`, surface-2 `#151518`, border `#222226`, text `#f4f4f6`. No light mode (by design). Card depth via a `inset 0 1px 0 rgba(255,255,255,.04)` top edge.
- **White is the accent** — "the accent is the absence of color." `--color-primary: #fff`.
- **Color = data only**: income `#00d18f`, expense `#ff5c7a`, transfer `#d4a64a`. Nothing else on screen is colored.
- **Terminal grid**: all radii are `0` (sharp corners everywhere). 56px topbar, 248px sidebar, 64px bottom nav.
- **CSS files**: `main.css` (tokens, reset, typography), `layout.css` (sidebar, topbar, bottom nav), `components.css` (cards, buttons, forms, modals, toasts), `dashboard.css` (wallet grid, charts, cash-flow breakdown), `pages.css` (budget, accounts, add-transaction, settings).
- See `MEMORY.md` → flow-design-system for the full rule set (replaced the earlier IBM Plex Sans / teal-accent theme).

### Mobile

- Bottom nav (≤768px): 4 tabs (Dashboard, Transactions, Spending, Budget) + centered FAB for Add Transaction. Active tab shown with pill indicator. FAB has glow ring.
- Sidebar slides in from left on mobile (hamburger), with overlay backdrop.
- All interactive targets meet 44px minimum.
- Resize handler ignores height-only changes (mobile URL bar show/hide) to prevent spurious re-renders.

### Key UX Patterns

- **Delete confirmation modals** on all destructive actions (account delete, transaction delete, delete-all-data). No `window.confirm()` anywhere.
- **Inline budget editing** — click any budget amount to edit in place; click away or press Enter to save.
- **Chart empty states** — skeleton loaders while data fetches; empty state with CTA if no data exists.
- **Budget onboarding** — shown in place of the budget list when no budgets and no spending exist.
- **Counter animations** — financial numbers animate from their current value to the new value on data refresh (not from zero). Skeletons only shown on first page load.
- **Page transitions** — 130ms exit fade + translateY on navigation between pages.
- **Toast notifications** — success/error feedback on all async operations, positioned above mobile nav.

## Roadmap — all three upgrades shipped (June 2026)

1. **Centralized nav + Money hub** ✅ — All navigation chrome (sidebar, topbar, bottom nav, Money pill tabs,
   More sheet) renders from `scripts/components/nav.js`. **To add a new section, add one entry to `NAV_ITEMS`**
   — no HTML edits needed. Mobile bottom nav: Dashboard · Transactions · [+] · Money · More.
   Spending/Budget/Subscriptions are the Money hub (pill tabs at the top of each); Crypto and Settings
   live in the More sheet and the sidebar.
2. **Real table for subscriptions** ✅ — the `subscriptions` table
   (see supabase-schema.sql v2 section — run it in the Supabase SQL editor). The store is table-first with
   automatic fallback to the legacy `user_settings` jsonb blob until the table exists, then it lazily
   migrates blob data into rows and empties the blob. No page code changed.
3. **PWA** ✅ — `manifest.json`, icons (`/icons`), and `sw.js` (network-first navigations, stale-while-
   revalidate statics, Supabase requests never cached). Registered from ui.js on https/localhost.
   **Bump `CACHE_VERSION` in sw.js when shipping changes.**

Also done: legacy `server/` Express+SQLite backend deleted (Supabase is the only backend now).
