# Personal Finance Tracker — Project Journal

> Living document. Update this file as decisions are made, phases complete, and plans change.
> Last updated: 2026-06-14

---

## Project Goal

A self-hosted, responsive web app accessible from any browser (desktop + phone) to log every financial transaction in detail and have everything auto-calculated — balances, category breakdowns, monthly summaries, and trends.

---

## Current Status

| Item | Value |
|---|---|
| Phase | 3 — complete. App is feature-complete; full "Flow" visual redesign shipped (June 2026) |
| Active step | Closing out the redesign — pages verified in-browser, currency-symbol bug fixed |
| Blockers | None |
| Next action | Add a test layer (start with `SummaryEngine` pure functions); anything beyond is new scope |

---

## Tech Stack (decided)

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS | Zero build step, open directly in browser |
| Styling | CSS custom properties + utility classes | Hand-rolled design system, no framework |
| Charts | Canvas-based (charts.js — custom) | No external library, lightweight |
| Auth + DB | Supabase | Auth, Postgres, Row Level Security, realtime-ready |
| Deployment | Vercel (static) | Free tier, easy deploy, `vercel.json` already present |
| Testing | — | Not implemented yet |

---

## Data Model (core shapes)

```ts
type Transaction = {
  id: string;
  date: string;           // ISO date YYYY-MM-DD
  amount: number;         // always positive
  type: 'income' | 'expense' | 'transfer';
  categoryId: string;
  accountId: string;
  toAccountId?: string;   // transfers only
  note: string;
  tags: string[];
};

type Account = {
  id: string;
  name: string;
  initialBalance: number;
  color: string;
};

type Category = {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense' | 'both';
};

type Budget = {
  categoryId: string;
  month: string;          // YYYY-MM
  limit: number;
};
```

> Update this section if the data model changes. Note the reason for any change below.

### Model change log
<!-- Example: 2026-06-10 — Added `currency` field to Transaction for multi-currency support -->

---

## Module Map

| Module | Layer | Responsibility | Status |
|---|---|---|---|
| `TransactionStore` | Data (`store.js`) | CRUD transactions, filtering, Supabase queries | ✅ Done |
| `AccountStore` | Data (`store.js`) | CRUD accounts, per-account balance, total balance | ✅ Done |
| `CategoryStore` | Data (`store.js`) | Hardcoded default categories (14), no DB table | ✅ Done |
| `SupaAuth` | Auth (`supabase.js`) | Session check, requireAuth redirect, signOut | ✅ Done |
| `SummaryEngine` | Pure logic (`summary.js`) | getTotals, getByCategory, getMonthlyRollup, getBalanceOverTime | ✅ Done |
| `Charts` | UI (`charts.js`) | Canvas line, donut, bar charts | ✅ Done |
| `ui.js` | UI | Sidebar toggle, active nav, resize redraw | ✅ Done |
| `dashboard.js` | Page | Summary cards, 3 charts, recent transactions, accounts list | ✅ Done |
| `transactions.js` | Page | Filterable/paginated list, delete modal, stats bar | ✅ Done |
| `add-transaction.js` | Page | Add/edit form, type tabs, category picker, validation | ✅ Done |
| `accounts.js` | Page | Account grid, add/edit modal, delete with warning | ✅ Done |
| `settings.js` | Page | Show user email, sign out, delete all data | ✅ Done |
| `api.js` | Service | Thin fetch wrapper for future backend (unused for now) | 🔵 Stub |
| Supabase schema | Backend | Postgres tables + RLS (`supabase-schema.sql`) | ✅ Done |
| `BudgetStore` | Data (`store.js`) | Monthly budget limits, usage % | ✅ Done |
| `SubscriptionStore` | Data (`store.js`) | Subscriptions, monthly/yearly cost rollups | ✅ Done |
| `SettingsStore` | Data (`store.js`) | Currency preference, persisted to Supabase | ✅ Done |
| `CSVService` | Service | Import/export CSV ↔ transactions | ✅ Done |
| Custom categories | Data (`store.js`) | User-editable categories (add/edit/emoji/delete) | ✅ Done |
| `CryptoBalances` / `CryptoStore` | Data (`crypto.js`) | Read-only BTC/SOL wallet balances via public APIs; Supabase table `crypto_wallets` (localStorage fallback); folds into net worth | ✅ Done |

---

## Build Phases

### Phase 1 — Frontend with localStorage  ✅ SKIPPED
Decided to go straight to Supabase instead of building a localStorage layer first.

### Phase 2 — Supabase backend + deployment  ✅ DONE (2026-06-05)
Auth, Postgres DB with RLS, full CRUD across all pages, deployed schema. Site live on Vercel.

### Phase 3 — UI/UX overhaul + power features  ✅ DONE (2026-06-14)
Mobile layout, design polish, UX flow improvements, then budgets and CSV
import/export — all shipped. Capped by a full visual redesign ("Flow", crypto-wallet mono UI). App is
feature-complete against the PRD.

---

## Ordered Build Plan

### Step 1 — Project scaffold ✅ DONE (2026-06-03)
- [x] Vanilla HTML/CSS/JS chosen over React — zero build step, open directly in browser
- [x] Folder structure: `styles/`, `scripts/data/`, `scripts/engine/`, `scripts/components/`, `scripts/pages/`, `pages/`
- [x] Design system: IBM Plex Sans, OLED dark theme, CSS custom properties
- [x] All 5 pages: Dashboard, Transactions, Add Transaction, Accounts, Settings
- [x] Canvas-based charts: line, donut, bar

### Step 2 — Data layer ✅ DONE (2026-06-04)
- [x] Supabase chosen over localStorage — auth + Postgres + RLS in one
- [x] `supabase-schema.sql` — accounts + transactions tables with RLS policies
- [x] `supabase.js` — client init, `SupaAuth.requireAuth()`, `getUser()`, `signOut()`
- [x] `TransactionStore` — getAll, getById, add, update, delete, query (filters), thisMonth
- [x] `AccountStore` — getAll, getById, add, update, delete, getBalance, getTotalBalance
- [x] `CategoryStore` — 14 hardcoded categories (no DB table needed)
- [x] `formatCurrency`, `formatDate`, `showToast` helpers in `store.js`

### Step 3 — SummaryEngine ✅ DONE (2026-06-04)
- [x] `getTotals(transactions)` → `{ income, expense, net, count }`
- [x] `getByCategory(transactions)` → sorted `{ categoryId, total }[]`
- [x] `getMonthlyRollup(transactions, year)` → 12-month array with income/expense/net
- [x] `getBalanceOverTime(transactions, accounts, days)` → daily balance points for line chart

### Step 4 — Transaction UI ✅ DONE (2026-06-04)
- [x] Add/edit form with type tabs (income/expense/transfer), category picker, validation
- [x] Prefill form when editing via `?id=` query param
- [x] Transaction list grouped by date, paginated (20/page), with stats bar
- [x] Filters: search, category, account, type, date range, clear all
- [x] Delete confirmation modal

### Step 5 — Dashboard ✅ DONE (2026-06-04)
- [x] Summary cards: Total Balance, Month Income, Month Expense, Month Net
- [x] Skeleton loading states on all cards and lists
- [x] Balance-over-time line chart (configurable 7/30/90 days)
- [x] Spending by category donut chart + legend
- [x] Monthly income vs. expense bar chart (year selector)
- [x] Recent transactions list (last 5)
- [x] Accounts list with live balances

### Step 6 — Account views ✅ DONE (2026-06-04)
- [x] Account grid with color stripe, type badge, live current balance
- [x] Add/edit account modal (name, type, initial balance, color)
- [x] Delete account with warning if it has transactions
- [x] Transfer transaction type wired up (to/from account, no net effect)

### Step 7 — Polish + deployment  ✅ DONE (2026-06-05)
- [x] OLED dark mode — already the default theme
- [x] Empty states on all lists
- [x] Skeleton loading states
- [x] Error handling with toast notifications on all pages
- [x] Sidebar on desktop / bottom nav on mobile (responsive)
- [x] Deployed to Vercel — site is live
- [x] Accessible from phone browser confirmed

### Step 8 — UI/UX overhaul  ✅ DONE

- [x] All 3 charts rewritten with hover tooltips (balance line, category donut, monthly bar); canvas
      resize-loop bug fixed by caching ctx/dimensions
- [x] Settings page redesigned — grouped sections, live tx/account counts, icon-prefixed rows
- [x] Branding: "FinTrack" → "Personal Finance"

**Functionality — all shipped:**
- [x] Currency selector in Settings (`SettingsStore`, persisted to Supabase; default CAD)
- [x] `BudgetStore` — monthly limits per category, inline editable
- [x] Tags UI on add-transaction form
- [x] `SubscriptionStore` — subscriptions page with cost rollups
- [x] `CSVService` — export / import CSV (Settings page)
- [x] Custom categories — add / edit / emoji picker / safe delete

### Step 9 — "Flow" redesign  ✅ DONE (2026-06-13 → 06-14)

Full crypto-wallet-style mono redesign across all pages (commits `099d631` → `bd9b979`):
- [x] New design system: true-black surfaces, white accent, color = data only, JetBrains Mono money,
      Inter UI, no ambient motion (replaced IBM Plex Sans + the earlier black/grey theme)
- [x] Dense 3-zone wallet dashboard grid + terminal-grid panels
- [x] Spending + Income unified into one **Cash Flow** page (segmented toggle, one balanced donut +
      ranked-breakdown panel)
- [x] Equal-height Accounts / Net Worth cards on the Transactions page (void removed)
- [x] Verified in-browser across all 8 pages (2026-06-14); fixed a CAD currency-symbol bug where the
      donut center and amount-input prefix showed `CA$` (en-US locale) instead of `$` (en-CA, matching
      `formatCurrency`)

### Next — hardening / new scope

The PRD feature set is complete. Logical next step is a **test layer** — `SummaryEngine` is pure
functions and the highest-value place to start. Everything past that (bank sync, investments,
multi-currency conversion) is explicitly out of PRD scope and is a product decision.

---

## Folder Structure (actual)

```
personal finance/
├── index.html                        # Dashboard
├── login.html                        # Login / signup page
├── manifest.json · sw.js · icons/    # PWA: manifest, service worker, icons
├── pages/
│   ├── accounts.html                 # Accounts + full transaction list ("Transactions" in nav)
│   ├── add-transaction.html          # Add / Edit transaction form (tags, category picker)
│   ├── spending.html                 # Cash Flow (Spending / Income toggle)
│   ├── budget.html                   # Budget limits per category
│   ├── subscriptions.html            # Subscriptions + cost rollups
│   └── settings.html                 # Email, currency, CSV import/export, delete-all, sign out
├── styles/                           # main · layout · components · dashboard · pages
├── scripts/
│   ├── data/
│   │   ├── supabase.js               # Supabase client + SupaAuth helpers
│   │   └── store.js                  # Transaction/Account/Category/Budget/
│   │                                 #   Subscription/Settings stores, CSVService, formatters
│   ├── engine/
│   │   └── summary.js                # SummaryEngine pure functions
│   ├── components/
│   │   ├── charts.js                 # Canvas charts: line, donut, bar
│   │   ├── nav.js                    # Centralized nav (NAV_ITEMS → sidebar/topbar/bottom/Money hub)
│   │   └── ui.js                     # Theme, sidebar toggle, active nav, toasts, SW registration
│   └── pages/                        # dashboard · accounts · add-transaction · spending ·
│                                     #   budget · subscriptions · crypto · settings
├── design-system/                    # Design reference / tokens
├── supabase-schema.sql               # Postgres schema + RLS policies
├── vercel.json                       # Vercel static deploy config
├── PRD.md · PRODUCT.md               # Product requirements / current-state doc
└── PROJECT.md                        # ← this file
```

---

## Decisions Log

> Record every significant decision here. Format: `YYYY-MM-DD — Decision — Why`

- 2026-06-03 — Chose vanilla HTML/CSS/JS over React/Vite — No build step; open index.html directly or via `npx serve`; simpler for a solo-user personal tool
- 2026-06-03 — Skipped localStorage phase entirely; went straight to Supabase — Avoids a migration later; Supabase free tier is enough; realtime + auth included
- 2026-06-03 — SummaryEngine as pure functions — Can run on frontend or backend without changes; easy to unit test
- 2026-06-03 — Amounts always stored as positive numbers — `type` field determines income vs. expense; avoids sign-confusion bugs
- 2026-06-03 — Single currency (USD) for now — Out of scope; add `currency` field per transaction in a future phase if needed
- 2026-06-03 — CategoryStore hardcoded, no DB table — Categories rarely change; avoids an extra Supabase table and round-trip; custom categories deferred to Phase 3
- 2026-06-04 — Switched to new Supabase project (closer region) — Latency improvement
- 2026-06-04 — IBM Plex Sans + OLED dark theme as default — Matches design system; no light mode toggle for now
- 2026-06-05 — Deployed to Vercel — Site is live and accessible from phone; login and backend confirmed working
- 2026-06-06 — Renamed to "Personal Finance" — dropped "FinTrack" branding entirely
- 2026-06-06 — Full black/white/grey color theme — removed all blue (Tailwind slate tokens replaced with true neutral greys); semantic green/red for income/expense kept
- 2026-06-06 — Charts rewritten with hover tooltips — canvas resize loop bug fixed by caching ctx on first draw; all 3 charts functional with interactive hover
- 2026-06-06 — Settings page redesigned — grouped sections, live data counts, cleaner layout
- 2026-06-10 — Default currency is CAD, user-selectable in Settings (`SettingsStore`, persisted to Supabase) — was hardcoded USD
- 2026-06-13 — "Flow" redesign — crypto-wallet mono UI: true black, white accent, color = data only, JetBrains Mono money, Inter UI; replaced IBM Plex Sans. See `MEMORY.md` / flow-design-system for the rules
- 2026-06-14 — Spending + Income merged into one Cash Flow page — removed the redundant separate Income view
- 2026-06-14 — Currency symbol unified to `formatCurrency`'s locale (`CURRENCY_LOCALES` map) — chart donut center and amount-input prefix were using en-US and rendered CAD as `CA$` instead of `$`
- 2026-06-14 — Added read-only **Crypto** balances (BTC + SOL) — public addresses only, never keys/seeds, no signing. Balances via keyless public APIs (Blockstream / publicnode RPC / CoinGecko). v1 stored wallets in localStorage
- 2026-06-14 — Crypto sync + net-worth integration — wallets now sync via a Supabase `crypto_wallets` table (table-first, localStorage fallback + lazy migration, same pattern as `SubscriptionStore`). Crypto folds into **net worth** (Dashboard "Net worth · cash + crypto" line + per-wallet panels; Accounts "incl. $X crypto") but never into the cash **balance**. Styling: Flow + crypto-wallet flair (per-chain `--chain` color, badges, gradient tiles)
- 2026-06-15 — **Removed the Recurring-transactions feature** — Subscriptions already covers scheduled/repeating charges, so the Recurring page, the dashboard due-banner, the add-transaction "Repeat" toggle, `RecurringStore`, and the `recurring_rules` table/column were all removed. Existing `recurring_rules` tables can be dropped manually in Supabase.

---

## Known Issues / Backlog

> Things noticed during build that aren't part of the current step.

- **No automated tests** — the app is feature-complete with zero test coverage. `SummaryEngine` is pure
  functions and the obvious first target.
- Subscriptions "Monthly subscription spend" chart shows a default $1 Y-axis when no subscription charges
  have posted yet (all "Next" dates are future) — an empty-state polish item, not a bug.
- Single-theme by design — "Flow" is true-black only; no light mode (intentional, not a gap).

> Resolved since last update: tags UI, currency selector, custom categories, recurring rules,
> subscriptions, and CSV import/export are all shipped. The unused `api.js` stub was deleted.

---

## Deployment Info

| Item | Value |
|---|---|
| Frontend URL | Live on Vercel (deployed) |
| Backend URL | N/A (Supabase) |
| Supabase project | grttprtovyzmlaicowsv.supabase.co |
| Deployment platform | Vercel (static, vercel.json configured) |
| Last deploy date | 2026-06-05 |

---

## Out of Scope (from PRD)

- Multi-user / authentication
- Bank sync / Open Banking API
- Currency conversion
- React Native mobile app
- Loan / debt tracking
- Investment portfolio tracking
