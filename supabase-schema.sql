-- FinTrack — Supabase schema
-- Paste this entire file into: Supabase → SQL Editor → New query → Run

create table if not exists accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  name            text not null,
  type            text not null default 'bank',
  initial_balance numeric not null default 0,
  color           text not null default '#6366f1',
  created_at      timestamptz not null default now()
);

create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  date          date not null,
  amount        numeric not null,
  type          text not null check (type in ('income','expense','transfer')),
  category_id   text,
  account_id    uuid references accounts(id) on delete set null,
  to_account_id uuid references accounts(id) on delete set null,
  note          text not null default '',
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index if not exists idx_tx_user_date on transactions(user_id, date desc);

alter table accounts     enable row level security;
alter table transactions enable row level security;

create policy "own accounts"     on accounts     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists user_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  currency          text  not null default 'CAD',
  budgets           jsonb not null default '{}',
  custom_categories jsonb not null default '[]',
  recurring_rules   jsonb not null default '[]',
  subscriptions     jsonb not null default '[]'
);

-- Run these if the table already exists (safe to re-run):
alter table user_settings add column if not exists custom_categories jsonb not null default '[]';
alter table user_settings add column if not exists recurring_rules   jsonb not null default '[]';
alter table user_settings add column if not exists subscriptions     jsonb not null default '[]';
alter table user_settings alter column currency set default 'CAD';
alter table user_settings enable row level security;
create policy "own settings" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- v2 (June 2026): per-row tables for subscriptions & recurring
-- rules, replacing the jsonb blobs in user_settings.
-- Safe to re-run. The app lazily migrates blob data into these
-- tables on first load after they exist, then empties the blobs.
-- ============================================================

create table if not exists subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  amount      numeric not null,
  frequency   text not null default 'monthly' check (frequency in ('weekly','monthly','yearly')),
  next_due    date not null,
  account_id  uuid references accounts(id) on delete set null,
  category_id text,
  color       text,
  auto_log    boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_subs_user on subscriptions(user_id, next_due);
alter table subscriptions enable row level security;
create policy "own subscriptions" on subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  note          text not null default '',
  amount        numeric not null,
  type          text not null default 'expense' check (type in ('income','expense','transfer')),
  category_id   text,
  account_id    uuid references accounts(id) on delete set null,
  to_account_id uuid references accounts(id) on delete set null,
  frequency     text not null default 'monthly' check (frequency in ('daily','weekly','monthly','yearly')),
  next_due      date not null,
  end_date      date,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_rules_user on recurring_rules(user_id, next_due);
alter table recurring_rules enable row level security;
create policy "own recurring rules" on recurring_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
