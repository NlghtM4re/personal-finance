# Product

## Register

product

## Users

Public audience (since July 2026; originally built for one person). Anyone managing personal finances who wants a tool, not a coach: they open the app daily or weekly to log transactions, check balances, and review spending against budgets. Assume a *new* user knows nothing about the app — first-run onboarding, empty states, and prompts must carry them — but never condescend to the experienced one: after setup, the interface gets out of the way. No user-specific defaults may be hardcoded (rates, employers, schedules); personal context lives in per-user settings. Primary tasks: add a transaction, check the balance, see where money went this month.

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

- **Dashboard** (`index.html`) — hero balance card (total balance + month income/expense + two net-change cells whose windows adapt to account age, so they always show distinct periods — e.g. 90 days vs 1 year, or a shorter span vs "All time" on a young account), balance-over-time line chart with range selector, monthly bar chart with week-navigation, recent transactions list, asset/debt account groups, crypto holdings panels. The balance-over-time chart doubles as a **30-day cash-flow forecast** — a header shows the projected balance and a low-balance warning, and the chart extends past a "now" divider with a dashed projection + variance band (forecasting math in the pure, tested `scripts/engine/insights.js`).
- **Accounts & Transactions** (`pages/accounts.html`) — left panel: compact account rows with avatar, balance, inline edit/delete; net worth card with assets/debts bar and summary. Right panel: stat chips (count, income, expenses, net), search + type/category filters, full paginated transaction list with edit/delete per row.
- **Cash Flow** (`pages/spending.html`) — month navigator, summary strip (spent/income/net), a Spending/Income segmented toggle that re-renders one balanced panel: category donut (center "Total spent"/"Total earned") + ranked breakdown, plus a monthly trend chart. Replaces the separate Spending and Income pages.
- **Budget** (`pages/budget.html`) — month navigator, summary strip (total budget / spent / over budget), per-category rows with inline editable budget limit, spend vs. limit progress bar, over-budget / unbudgeted sections. Budget onboarding shown when no data exists. Suggested budgets from the trailing 3 months — apply per category (inline chip) or in bulk (banner); recommendation math lives in the pure, tested `scripts/engine/insights.js`.
- **Add Transaction** (`pages/add-transaction.html`) — type toggle (expense/income/transfer), amount with currency prefix, date, account select, note, tags, category picker. As you type the note it **suggests a category from your own past transactions** (exact/normalized note match, then token overlap; no AI, no network — `InsightsEngine.suggestCategory`), one click to apply. Doubles as edit form when `?id=` is present; delete via confirmation modal.
- **Crypto** (`pages/crypto.html`) — read-only crypto wallet balances (BTC + SOL). Paste a **public address** only; the app fetches the live balance from keyless public APIs (Blockstream / publicnode RPC), converts to the user's currency (CoinGecko), and shows it in the Flow style. Never accepts a private key or seed phrase; never signs or sends. Supports multiple addresses per wallet (BTC HD wallets rotate receive addresses). Balance/price lookups auto-retry on transient failures and fall back to a cached last-known value (shown with a "last known" hint) so a flaky first load no longer needs a manual refresh; live API hosts bypass the service worker so balances are never served stale from cache. Wallets sync via the Supabase `crypto_wallets` table (localStorage fallback until the schema is run). The holdings total folds into **net worth** on the Dashboard (per-wallet panels + "Net worth · cash + crypto" line) and Accounts ("incl. $X crypto") — never into the cash balance.
- **Hours Tracker** (`pages/shifts.html`) — work-hours + pay tracker built for fast logging. **Quick log** is the fast path: pick a day chip (Today / Yest / recent weekdays) and type **just the total hours** — rate defaults to **$17/h**, logged as income in one tap (no clock times needed). "More options" opens the full form (start/end, break, **tips**, **either an hourly rate or a flat "Total paid"** amount, employer, account). Pay/hours math is pure + tested (`ShiftEngine` — direct-hours, breaks, overnight shifts, fixed-or-hourly, tips). **Payday reconciliation** (for under-the-table / rounded-up pay): an **Unpaid so far** panel shows accrued hours × rate as an *estimate*; **Mark as paid** settles every unpaid day at once — you enter the **actual cash** received, it shows the difference as a **bonus** (estimate vs actual), records a payout, and (default on) adds just the extra as a `tags:['shift','bonus']` income row so your balance equals the real cash. A **Payouts** history lists each settlement with an **Undo**. Payday is fully user-driven (no assumed schedule). **Presets**, a weekly goal ring, a 10-week earnings chart, and day-of-week / per-job breakdowns round it out. Each shift's estimated pay creates a linked income transaction (`tags:['shift']`, kept in sync on edit/delete). Stored in the Supabase `shifts` table (now incl. an `hours` column) + `shift_payouts` table, with a localStorage fallback until the schema (v5) is run; default rate + presets + goal remembered locally. Linked from the sidebar + mobile More sheet.
- **Insights** (`pages/insights.html`) — app-wide spending insights feed: overall spend vs last month, per-category spikes vs the trailing 3-month average, savings-rate shifts, and untracked-recurring detection (a roughly-monthly, stable charge that isn't a tracked subscription, with a "Track it" link). Detection lives in the pure, tested `InsightsEngine.generateInsights`; the page only renders. Linked from the sidebar + mobile More sheet.
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
