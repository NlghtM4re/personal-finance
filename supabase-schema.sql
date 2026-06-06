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
  user_id  uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'USD',
  budgets  jsonb not null default '{}'
);
alter table user_settings enable row level security;
create policy "own settings" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
