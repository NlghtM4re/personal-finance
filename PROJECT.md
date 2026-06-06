# Personal Finance Tracker — Project Journal

> Living document. Update this file as decisions are made, phases complete, and plans change.
> Last updated: 2026-06-06 (session 2)

---

## Project Goal

A self-hosted, responsive web app accessible from any browser (desktop + phone) to log every financial transaction in detail and have everything auto-calculated — balances, category breakdowns, monthly summaries, and trends.

---

## Current Status

| Item | Value |
|---|---|
| Phase | 3 — UI/UX polish & power features |
| Active step | Step 8 — ongoing (charts ✅, settings ✅, branding ✅, theme ✅) |
| Blockers | None |
| Next action | Mobile layout polish, currency selector, budgets |

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
  recurringId?: string;   // Phase 3
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
| `BudgetStore` | State | Monthly budget limits, usage % | ❌ Not started |
| `RecurringStore` | State | Scheduled transactions, due-date detection | ❌ Not started |
| `CSVService` | Service | Import/export CSV ↔ transactions | ❌ Not started |

---

## Build Phases

### Phase 1 — Frontend with localStorage  ✅ SKIPPED
Decided to go straight to Supabase instead of building a localStorage layer first.

### Phase 2 — Supabase backend + deployment  ✅ DONE (2026-06-05)
Auth, Postgres DB with RLS, full CRUD across all pages, deployed schema. Site live on Vercel.

### Phase 3 — UI/UX overhaul + power features  ← WE ARE HERE
Fix mobile layout, design polish, UX flow improvements. Then budgets, recurring transactions, CSV import/export.

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

### Step 8 — UI/UX overhaul  ← WE ARE HERE

**Completed this session:**
- [x] All 3 charts completely rewritten (balance line, spending donut, monthly bar)
  - Hover tooltips on all charts showing exact values
  - Balance chart: gradient fill, Y-axis labels, date labels, crosshair
  - Donut chart: ring with center total, hover shows category % and amount
  - Bar chart: current month highlighted, Income/Exp legend, full tooltip
  - Fixed hover explosion bug (canvas resize loop) — now caches ctx/dimensions
  - Fixed donut not filling container (CSS `width:100%; height:100%` on canvas)
- [x] Settings page fully redesigned — grouped sections (Account, Data, Danger Zone), live tx/account counts, icon-prefixed rows
- [x] Branding: "FinTrack" → "Personal Finance" across all pages
- [x] Color theme: full black/white/grey — replaced all Tailwind slate (blue-tinted) tokens with true neutral greys (`#000`, `#0d0d0d`, `#1a1a1a`)
- [x] Removed logo icon from sidebar header and all topbar instances
- [x] Sidebar header height aligned with topbar (both 56px — same horizontal band)
- [x] "Add Transaction" sidebar item: replaced jarring white block with outlined ghost button

**Still to do — design/UX:**
- [ ] Mobile layout: bottom nav overlaps page content on some screens
- [ ] Mobile layout: forms and modals not fully optimized for small screens
- [ ] Add transaction: no feedback after save (goes straight back, no confirmation)
- [ ] Transactions list: pagination feels abrupt

**Still to do — functionality:**
- [ ] Currency selector in Settings (hardcoded USD everywhere)
- [ ] `BudgetStore` — monthly limits per category, stored in Supabase
- [ ] Budget progress bars on Dashboard
- [ ] Tags UI on add-transaction form (field exists in DB, not surfaced in UI)
- [ ] `RecurringStore` — scheduled transactions, due-date banner
- [ ] `CSVService` — export / import CSV
- [ ] Custom categories (currently hardcoded 14)

---

## Folder Structure (actual)

```
personal finance/
├── index.html                        # Dashboard
├── login.html                        # Login / signup page
├── pages/
│   ├── transactions.html             # Full transaction list + filters
│   ├── add-transaction.html          # Add / Edit transaction form
│   ├── accounts.html                 # Account cards + modal
│   └── settings.html                 # User email, sign out, delete all data
├── styles/                           # CSS files (design system)
├── scripts/
│   ├── data/
│   │   ├── supabase.js               # Supabase client + SupaAuth helpers
│   │   ├── store.js                  # TransactionStore, AccountStore, CategoryStore
│   │   └── api.js                    # Stub fetch wrapper (future backend, unused)
│   ├── engine/
│   │   └── summary.js                # SummaryEngine pure functions
│   ├── components/
│   │   ├── charts.js                 # Canvas charts: line, donut, bar
│   │   └── ui.js                     # Sidebar toggle, active nav, resize
│   └── pages/
│       ├── dashboard.js
│       ├── transactions.js
│       ├── add-transaction.js
│       ├── accounts.js
│       └── settings.js
├── design-system/                    # Design reference / tokens
├── supabase-schema.sql               # Postgres schema + RLS policies
├── vercel.json                       # Vercel static deploy config
├── PRD.md                            # Full product requirements
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

---

## Known Issues / Backlog

> Things noticed during build that aren't part of the current step.

- Tags field exists in the DB schema and is saved on transactions, but there's no UI to add/view tags
- Currency is hardcoded to USD everywhere — no setting to change it
- `api.js` stub is loaded on all pages but never used (Supabase is used directly instead)
- No light mode — OLED dark is the only theme
- Categories are hardcoded; no way for user to add custom categories

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
