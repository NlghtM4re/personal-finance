# Personal Finance Tracker — Project Journal

> Living document. Update this file as decisions are made, phases complete, and plans change.
> Last updated: 2026-06-03

---

## Project Goal

A self-hosted, responsive web app accessible from any browser (desktop + phone) to log every financial transaction in detail and have everything auto-calculated — balances, category breakdowns, monthly summaries, and trends.

---

## Current Status

| Item | Value |
|---|---|
| Phase | 1 — Frontend (localStorage) |
| Active step | Step 2 — Data layer (stores) |
| Blockers | None |
| Next action | Create first account, add transactions, verify charts render |

---

## Tech Stack (decided)

| Layer | Choice | Reason |
|---|---|---|
| Frontend framework | React + TypeScript (Vite) | Fast dev, strong typing, component model |
| Styling | Tailwind CSS | Utility-first, responsive out of the box |
| Charts | Recharts | Lightweight, React-native |
| State + persistence | Zustand + localStorage | Simple, no backend needed in Phase 1 |
| Backend (Phase 2) | Express + SQLite (better-sqlite3) | Lightweight, self-contained, no separate DB server |
| Deployment (remote) | Vercel (frontend) + Railway or Fly.io (backend) | Free tiers, easy deploys |
| Deployment (self-host) | Docker Compose | Single command to run everything locally |
| Testing | Vitest (unit) + Playwright (E2E) | Co-located with Vite, fast |

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
| `TransactionStore` | State | CRUD transactions, filtering, sorting | Not started |
| `AccountStore` | State | CRUD accounts, per-account balance | Not started |
| `CategoryStore` | State | Predefined + custom categories | Not started |
| `BudgetStore` | State | Monthly budget limits, usage % | Not started |
| `RecurringStore` | State | Scheduled transactions, due-date detection | Not started |
| `SummaryEngine` | Pure logic | Totals, category breakdowns, monthly rollups | Not started |
| `CSVService` | Service | Import/export CSV ↔ transactions | Not started |
| `TransactionForm` | UI | Add/edit transaction form with validation | Not started |
| `TransactionList` | UI | Filterable, searchable transaction list | Not started |
| `Dashboard` | UI | Summary cards, charts, budget bars | Not started |
| `Charts` | UI | Balance line, category donut, monthly bar | Not started |
| `AccountList` | UI | Per-account balance view | Not started |
| Express API | Backend | REST endpoints for all stores | Not started |
| SQLite schema | Backend | Persistent DB, matches data model above | Not started |

---

## Build Phases

### Phase 1 — Frontend with localStorage  ← WE ARE HERE
Data lives in the browser. No backend. Immediately usable.

### Phase 2 — Backend sync
Add Express + SQLite so data lives on a server and syncs across all devices.

### Phase 3 — Power features
Budgets, recurring transactions, tags, CSV import/export, dark mode.

---

## Ordered Build Plan

### Step 1 — Project scaffold ✅ DONE (2026-06-03)
- [x] Vanilla HTML/CSS/JS chosen over React — zero build step, open directly in browser
- [x] Folder structure created: `styles/`, `scripts/data/`, `scripts/engine/`, `scripts/components/`, `scripts/pages/`, `pages/`
- [x] Design system: CSS custom properties for light/dark tokens, Inter font
- [x] All 4 pages built: Dashboard, Transactions, Add Transaction, Accounts
- [x] Canvas-based charts (no external library): line, donut, bar
- [x] App confirmed running via `npx serve` on port 3333

### Step 2 — Data layer (stores)
- [ ] `CategoryStore` — seed with default categories (Food, Rent, Salary, Transport, etc.)
- [ ] `AccountStore` — CRUD + balance calculation from initial balance + transactions
- [ ] `TransactionStore` — CRUD, filtering by date range / category / account, search by note
- [ ] Persist all stores to localStorage via Zustand middleware
- [ ] Write Vitest unit tests for balance calculation and filtering logic

### Step 3 — SummaryEngine (pure logic)
- [ ] Function: `getTotals(transactions, dateRange)` → `{ income, expenses, balance }`
- [ ] Function: `getByCategory(transactions, dateRange)` → `{ categoryId, total }[]`
- [ ] Function: `getMonthlyRollup(transactions, year)` → `{ month, income, expenses }[]`
- [ ] Function: `getBalanceOverTime(transactions, accounts)` → `{ date, balance }[]`
- [ ] Write Vitest tests for all four functions with fixture data

### Step 4 — Transaction UI
- [ ] `TransactionForm` component (add + edit mode, validation)
- [ ] `TransactionList` component (sorted newest-first, with filters and search)
- [ ] Delete confirmation modal
- [ ] Mobile-friendly layout for list and form

### Step 5 — Dashboard
- [ ] Summary cards: Total Balance, Income this month, Expenses this month
- [ ] Balance-over-time line chart (Recharts)
- [ ] Spending by category donut chart (Recharts)
- [ ] Monthly income vs. expenses bar chart (Recharts)
- [ ] Responsive grid layout (stacks on mobile)

### Step 6 — Account views
- [ ] Account list with individual balances
- [ ] Filter transaction list by account
- [ ] Transfer transaction type (moves money between accounts, no net effect on total)

### Step 7 — Polish + deployment (Phase 1 complete)
- [ ] Dark mode (Tailwind `dark:` variants)
- [ ] Empty states and loading states
- [ ] Error boundaries
- [ ] Deploy frontend to Vercel
- [ ] Confirm accessible from phone browser

### Step 8 — Backend (Phase 2)
- [ ] Init Express project in `/server`
- [ ] Define SQLite schema (matches data model)
- [ ] REST endpoints: transactions, accounts, categories
- [ ] Replace Zustand localStorage with API calls
- [ ] Deploy backend to Railway or Fly.io
- [ ] Connect frontend to deployed backend URL

### Step 9 — Power features (Phase 3)
- [ ] `BudgetStore` + budget progress bars on Dashboard
- [ ] `RecurringStore` + due-date detection + reminder banner
- [ ] Tags on transactions
- [ ] `CSVService` — export all transactions
- [ ] `CSVService` — import from CSV with column mapping UI

---

## Folder Structure (target)

```
personal finance/
├── index.html                        # Dashboard
├── pages/
│   ├── transactions.html             # Full transaction list + filters
│   ├── add-transaction.html          # Add / Edit transaction form
│   └── accounts.html                 # Account cards + modal
├── styles/
│   ├── main.css                      # Design tokens, reset, typography
│   ├── layout.css                    # Sidebar, topbar, bottom nav, responsive
│   ├── components.css                # Buttons, cards, forms, badges, modals
│   ├── dashboard.css                 # Summary cards, chart containers, grids
│   └── pages.css                     # Transactions list, accounts, form page
├── scripts/
│   ├── data/
│   │   └── store.js                  # localStorage CRUD: TransactionStore, AccountStore, CategoryStore
│   ├── engine/
│   │   └── summary.js                # Pure functions: totals, by-category, monthly rollup, balance over time
│   ├── components/
│   │   ├── charts.js                 # Canvas charts: line, donut, bar (no external lib)
│   │   └── ui.js                     # Sidebar toggle, dark mode, active nav, resize redraw
│   └── pages/
│       ├── dashboard.js              # Dashboard data + render logic
│       ├── transactions.js           # Filter, paginate, delete transaction list
│       ├── add-transaction.js        # Form logic: add/edit/validate
│       └── accounts.js              # Account grid, modal, balance display
├── .claude/
│   └── launch.json                   # Dev server config (npx serve, port 3333)
├── PRD.md                            # Full product requirements
└── PROJECT.md                        # ← this file (living project journal)
```

---

## Decisions Log

> Record every significant decision here. Format: `YYYY-MM-DD — Decision — Why`

- 2026-06-03 — Chose vanilla HTML/CSS/JS over React/Vite — No build step; open index.html directly or via `npx serve`; simpler for a solo-user personal tool
- 2026-06-03 — Use localStorage in Phase 1, migrate in Phase 2 — Ship fast, avoid infra complexity until needed
- 2026-06-03 — SummaryEngine as pure functions — Can run on frontend or backend without changes; easy to unit test
- 2026-06-03 — amounts always stored as positive numbers — `type` field determines income vs. expense; avoids sign-confusion bugs
- 2026-06-03 — Single currency for now — Out of scope; add `currency` field per transaction in a future phase if needed

---

## Known Issues / Backlog

> Things noticed during build that aren't part of the current step.

<!-- Example: 2026-06-15 — TransactionList re-renders too often on filter change — needs memoization -->

---

## Deployment Info

> Fill in once deployed.

| Item | Value |
|---|---|
| Frontend URL | — |
| Backend URL | — |
| Deployment platform | — |
| Last deploy date | — |

---

## Out of Scope (from PRD)

- Multi-user / authentication
- Bank sync / Open Banking API
- Currency conversion
- React Native mobile app
- Loan / debt tracking
- Investment portfolio tracking
