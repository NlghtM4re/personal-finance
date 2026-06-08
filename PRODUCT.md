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

## Current State (as of 2026-06-07)

### Pages

- **Dashboard** (`index.html`) — hero balance card (total balance + month income/expense + net change over 1Y/90D), balance-over-time line chart with range selector, monthly bar chart with week-navigation, recent transactions list, asset/debt account groups, recurring-transactions-due banner.
- **Accounts & Transactions** (`pages/accounts.html`) — left panel: compact account rows with avatar, balance, inline edit/delete; net worth card with assets/debts bar and summary. Right panel: stat chips (count, income, expenses, net), search + type/category filters, full paginated transaction list with edit/delete per row.
- **Spending** (`pages/spending.html`) — month navigator, summary chips (spent/income/net), donut chart by category, category legend, top-expenses list with proportional progress bars.
- **Budget** (`pages/budget.html`) — month navigator, summary strip (total budget / spent / over budget), per-category rows with inline editable budget limit, spend vs. limit progress bar, over-budget / unbudgeted sections. Budget onboarding shown when no data exists.
- **Add Transaction** (`pages/add-transaction.html`) — type toggle (expense/income/transfer), amount with currency prefix, date, account select, note, tags, recurring toggle (frequency + end date), category picker. Doubles as edit form when `?id=` is present; delete via confirmation modal.
- **Settings** (`pages/settings.html`) — account email, transaction/account counts, currency selector, delete-all-data via confirmation modal, sign out.

### Architecture

- Static HTML/CSS/JS — no build step, no framework.
- Supabase backend: `transactions`, `accounts` tables per user. Auth via `SupaAuth` wrapper (email/password).
- Data layer: `TransactionStore`, `AccountStore`, `CategoryStore`, `RecurringStore`, `SettingsStore` in `scripts/data/store.js`.
- Categories are hardcoded client-side (no DB table). Recurring rules stored in `localStorage` via `RecurringStore`.
- Charts via Chart.js (`scripts/components/charts.js`). Summary math in `scripts/engine/summary.js`.
- Shared UI (theme, sidebar, nav, page transitions, toast) in `scripts/components/ui.js`.

### Design System

- **Font**: IBM Plex Sans (300–700). `font-variant-numeric: tabular-nums` on body.
- **Dark theme (default)**: true black bg (`#000`), surface `#0d0d0d`, border `#222`. Cards have `inset 0 1px 0 rgba(255,255,255,.05)` top highlight for depth.
- **Light theme**: toggleable, persisted to `localStorage`.
- **Semantic colors**: income `#22c55e`, expense `#ef4444`, transfer `#f59e0b`, key figure / accent `#3ecfb2`.
- **Radius scale**: sm 6px, md 10px, lg 14px, xl 20px. Transaction icons use 10px.
- **CSS files**: `main.css` (tokens, reset, typography), `layout.css` (sidebar, topbar, bottom nav), `components.css` (cards, buttons, forms, modals, toasts), `dashboard.css` (hero, charts, spending breakdown), `pages.css` (budget, accounts, add-transaction, settings).

### Mobile

- Bottom nav (≤768px): 4 tabs (Dashboard, Transactions, Spending, Budget) + centered FAB for Add Transaction. Active tab shown with pill indicator. FAB has glow ring.
- Sidebar slides in from left on mobile (hamburger), with overlay backdrop.
- All interactive targets meet 44px minimum.
- Resize handler ignores height-only changes (mobile URL bar show/hide) to prevent spurious re-renders.

### Key UX Patterns

- **Delete confirmation modals** on all destructive actions (account delete, transaction delete, delete-all-data). No `window.confirm()` anywhere.
- **Inline budget editing** — click any budget amount to edit in place; click away or press Enter to save.
- **Recurring transactions** — banner on dashboard when any rules are due; Log or Skip per item.
- **Chart empty states** — skeleton loaders while data fetches; empty state with CTA if no data exists.
- **Budget onboarding** — shown in place of the budget list when no budgets and no spending exist.
- **Counter animations** — financial numbers animate from their current value to the new value on data refresh (not from zero). Skeletons only shown on first page load.
- **Page transitions** — 130ms exit fade + translateY on navigation between pages.
- **Toast notifications** — success/error feedback on all async operations, positioned above mobile nav.
