# Public Launch Plan

Goal: make the app usable by **new and average users**, not just its builder.
Each phase ends with a verification pass and a commit. Resume from the first
unchecked item. `[user]` = needs an action only the account owner can do.

## Phase 1 — Multi-tenant hardening

- [x] RLS policies exist for all 8 tables in `supabase-schema.sql` (accounts,
      transactions, user_settings, subscriptions, crypto_wallets, shifts,
      shift_payouts, jobs — all `auth.uid() = user_id`)
- [x] RLS **live-audit script** written: `supabase-verify-rls.sql`
- [ ] `[user]` Run `supabase-verify-rls.sql` in the prod SQL editor — queries
      2 & 3 must return zero rows
- [x] Auth lifecycle complete in `login.html`: signup confirmation, resend,
      forgot password, recovery view (verified 2026-07-11)
- [x] CoinGecko proxy (`api/crypto.js`) has in-memory + CDN cache → shared
      upstream calls, survives 429s with stale fallback
- [x] No secrets committed (grep audit 2026-07-11; anon key is public by design)
- [ ] `[user]` Supabase: confirm email-confirmation is ON, plan paid tier
      before real users (free tier pauses after inactivity), enable backups
- Note: BTC/SOL balance lookups are client-side per-address (Blockstream /
  publicnode) — per-user, uncacheable server-side, acceptable at launch scale.

## Phase 2 — First-run UX (new-user experience)

- [x] De-personalize Hours Tracker: `$17/h` fallback removed from
      `scripts/pages/shifts.js` (`jobRate()`, `quickLog()`, quick-log meta) —
      a missing rate now prompts "Set an hourly rate for this job" and opens
      the job modal instead of inventing a number
- [x] First-run onboarding: dashboard "Welcome to Flow" card (`#firstRunCard`)
      shown only with 0 accounts + 0 transactions, dismissable, 3 linked steps
      (account → transaction → currency); auto-hides once data exists
- [x] Empty-state audit: dashboard widgets, insights, budget onboarding,
      shifts, spending, transactions, accounts, crypto all have empty states
- [x] Verify (2026-07-11): card rendered desktop + mobile in preview (Flow
      style holds), 142/142 tests green

## Phase 3 — Legal & trust

- [ ] `pages/privacy.html` + `pages/terms.html` (Flow style), linked from
      login page footer + Settings
- [ ] Crypto page: user-facing trust copy — "public addresses only, read-only,
      never keys or seeds"
- [ ] Security/abuse contact (mailto in footer or SECURITY.md)

## Phase 4 — Ops & reliability

- [ ] GitHub Actions CI: `npm test` on push/PR
- [ ] Client error reporting (lightweight — window.onerror → endpoint or Sentry)
- [ ] Feedback link in Settings
- [ ] `[user]` Enable Vercel Analytics on the project

## Phase 5 — Public face

- [ ] Landing page (separate from login): what it is, screenshots, sign-up CTA
- [ ] OG/social meta + SEO basics on landing
- [ ] Update PRODUCT.md positioning from "solo user" to public audience
