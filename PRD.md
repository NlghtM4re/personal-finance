# PRD — Personal Finance Tracker

## Problem Statement

Managing personal finances across multiple devices is fragmented and tedious. Existing apps are either too complex, require subscriptions, or don't offer full control over your data. The user needs a self-hosted, always-accessible web app to log every dollar in and out — with enough detail and calculation power to understand their full financial picture at any time.

## Solution

A responsive web application accessible from any browser (desktop or mobile) where the user can log detailed financial transactions and have everything automatically calculated — running balances, category breakdowns, monthly summaries, and spending trends — all in one place.

## User Stories

1. As a user, I want to log a transaction with an amount, date, category, and note, so that I have a complete record of every financial event.
2. As a user, I want to mark a transaction as income or expense, so that my balance is calculated correctly.
3. As a user, I want to choose a category from a predefined list (e.g., Food, Rent, Salary, Transport), so that I can organize my spending.
4. As a user, I want to create custom categories, so that I can tailor the app to my lifestyle.
5. As a user, I want to edit or delete any transaction, so that I can correct mistakes.
6. As a user, I want to see my current total balance at a glance, so that I always know where I stand.
7. As a user, I want to see a list of all transactions sorted by date (newest first), so that I can review recent activity.
8. As a user, I want to filter transactions by category, so that I can focus on a specific area of spending.
9. As a user, I want to filter transactions by date range (e.g., this month, last month, custom range), so that I can review a specific period.
10. As a user, I want to search transactions by keyword in the notes field, so that I can find a specific entry quickly.
11. As a user, I want to see total income and total expenses for any selected period, so that I can understand my cash flow.
12. As a user, I want to see a breakdown of spending by category for any period, so that I know where my money goes.
13. As a user, I want to see a monthly summary view (income vs. expenses per month), so that I can spot trends over time.
14. As a user, I want to see a chart of my balance over time, so that I can visualize financial progress.
15. As a user, I want to see a chart of spending by category (e.g., pie/donut chart), so that I can quickly grasp my spending distribution.
16. As a user, I want to use the app on my phone with a layout that fits a small screen, so that I can log transactions on the go.
17. As a user, I want the app to load fast even on mobile, so that logging a transaction feels effortless.
18. As a user, I want my data to persist across sessions, so that I don't lose my history.
19. As a user, I want to export my transactions as a CSV file, so that I can use the data in a spreadsheet.
20. As a user, I want to import transactions from a CSV file, so that I can migrate existing data.
21. As a user, I want to set a monthly budget per category, so that I can track whether I'm overspending.
22. As a user, I want to see a visual indicator (e.g., progress bar) showing how much of my budget I've used per category, so that I get an instant warning.
23. As a user, I want to add multiple accounts (e.g., cash, bank, credit card), so that I can track money across all my financial accounts.
24. As a user, I want each transaction to be linked to an account, so that per-account balances are correct.
25. As a user, I want to see the balance of each account separately, so that I know the state of each one.
26. As a user, I want to log a transfer between accounts, so that money moved between accounts doesn't appear as income or expense.
27. As a user, I want to add a recurring transaction (e.g., monthly rent), so that I don't have to log it manually each time.
28. As a user, I want the app to remind me of upcoming recurring transactions, so that I stay on top of scheduled expenses.
29. As a user, I want to attach a tag or label to transactions beyond category (e.g., "vacation", "tax-deductible"), so that I can organize across dimensions.
30. As a user, I want a dashboard home screen summarizing the most important numbers at a glance, so that I get a financial snapshot without navigating deep.

## Implementation Decisions

### Tech Stack
- **Frontend**: React (Vite) with TypeScript — fast dev experience, component model ideal for dashboard UIs.
- **Styling**: Tailwind CSS — utility-first, excellent mobile responsiveness with minimal custom CSS.
- **Charts**: Recharts — lightweight, composable, React-native charting library.
- **State / Data**: Zustand for client state; data persisted to localStorage initially, with a migration path to a backend DB.
- **Backend (Phase 2)**: Express + SQLite (via better-sqlite3) to enable multi-device sync. Accessed via REST API.
- **Deployment**: Vercel (frontend) + Railway or Fly.io (backend) for remote access from any device; or Docker Compose for self-hosting.

### Module Breakdown

| Module | Responsibility |
|---|---|
| `TransactionStore` | CRUD for transactions; filtering, sorting, aggregation queries |
| `AccountStore` | CRUD for accounts; per-account balance calculation |
| `CategoryStore` | Predefined + custom categories management |
| `BudgetStore` | Monthly budget limits per category; usage calculation |
| `RecurringStore` | Scheduled transactions; due-date detection |
| `SummaryEngine` | Computes totals, category breakdowns, monthly rollups from raw transactions |
| `TransactionForm` | Controlled form for add/edit with validation |
| `TransactionList` | Virtualized, filterable, searchable list |
| `Dashboard` | Assembles summary cards, charts, budget bars |
| `CSVService` | Import/export logic; CSV ↔ transaction mapping |
| `Charts` | Balance-over-time line chart; category donut chart; monthly bar chart |

### Data Shape (core)

```ts
type Transaction = {
  id: string;
  date: string;           // ISO date
  amount: number;         // always positive
  type: 'income' | 'expense' | 'transfer';
  categoryId: string;
  accountId: string;
  toAccountId?: string;   // for transfers
  note: string;
  tags: string[];
  recurringId?: string;
};

type Account = { id: string; name: string; initialBalance: number; color: string };
type Category = { id: string; name: string; icon: string; type: 'income' | 'expense' | 'both' };
type Budget = { categoryId: string; month: string; limit: number };
```

### API Contracts (Phase 2)
- `GET /transactions?from=&to=&categoryId=&accountId=` — paginated list
- `POST /transactions` — create
- `PUT /transactions/:id` — update
- `DELETE /transactions/:id` — delete
- `GET /summary?from=&to=` — aggregated totals (computed server-side)

## Testing Decisions

**What makes a good test here:** Test the outputs of pure calculation modules (SummaryEngine, BudgetStore usage, balance calculation) given specific transaction inputs. Do not test React rendering internals or store implementation details — test observable results.

### Modules to test
- `SummaryEngine` — given a set of transactions, assert correct totals, category breakdowns, and monthly rollups.
- `AccountStore` — assert correct balance after a sequence of income, expense, and transfer transactions.
- `BudgetStore` — assert correct usage percentage and over-budget detection.
- `CSVService` — round-trip test: export transactions → import → assert identical records.
- `RecurringStore` — assert correct due-date detection for monthly/weekly/yearly recurrences.

### Testing approach
- Vitest (co-located with Vite) for unit tests on pure modules.
- Playwright for E2E: add a transaction → see it in the list → verify balance updates.

## Out of Scope

- Multi-user / authentication (single-user app for now).
- Bank sync / Open Banking API integration.
- Currency conversion (single currency assumed).
- Mobile native app (React Native) — responsive web covers the phone use case.
- Loan/debt tracking.
- Investment portfolio tracking.

## Further Notes

- **Phase 1**: Frontend only with localStorage — deployable immediately, zero backend needed.
- **Phase 2**: Add Express + SQLite backend for true multi-device sync (data lives on server, not each browser).
- **Phase 3**: Budgets, recurring transactions, tags, CSV import/export.
- The SummaryEngine should be a pure function module (no side effects) so it can run on both frontend and backend without changes.
- Tailwind's `dark:` variants should be wired up from the start — finance apps are often used at night.
