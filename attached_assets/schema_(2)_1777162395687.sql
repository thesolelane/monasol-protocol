-- ============================================================
-- NexusBridge Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- LOCKERS
-- Each row is a deployed Locker contract
-- (Locker = Building in the NexusBridge neighborhood)
create table lockers (
  id            uuid primary key default gen_random_uuid(),
  locker_ref    text not null unique,       -- e.g. "LCK-4891...203"
  locker_number bigint not null unique,     -- full integer e.g. 4891203
  tier          text not null check (tier in ('public','standard','vip','dedicated')),
  vault_capacity int not null,              -- max vaults this locker holds
  vault_count   int not null default 0,     -- current occupied vaults
  status        text not null default 'active' check (status in ('active','frozen','retired')),
  created_at    timestamptz not null default now()
);

-- VAULTS
-- Each row is one Vault inside a Locker
-- (Vault = Apartment in the Building in the NexusBridge neighborhood)
create table vaults (
  id              uuid primary key default gen_random_uuid(),
  vault_ref       text not null unique,     -- e.g. "VLT-38847...291"
  vault_number    bigint not null,          -- full integer
  locker_id       uuid not null references lockers(id),
  owner_wallet    text not null,            -- Solana wallet address
  nft_token_id    text not null unique,     -- Solana NFT mint address
  nft_mint        text not null,            -- Metaplex mint address
  security_mode   text not null default 'unset' check (security_mode in ('unset','system','self')),
  status          text not null default 'active' check (status in ('active','pledged','settling','released','degraded','locked')),
  lease_paid      boolean not null default false,
  lease_paid_at   timestamptz,
  lease_amount_sol numeric(18,9),           -- SOL amount paid for lifetime lease
  deposit_sol     numeric(18,9) default 0, -- SOL deposited into vault
  created_at      timestamptz not null default now(),
  unique(locker_id, vault_number)
);

-- SUB-VAULTS
-- (Sub-vault = Room in the Apartment in the Building in the NexusBridge neighborhood)
create table sub_vaults (
  id            uuid primary key default gen_random_uuid(),
  vault_id      uuid not null references vaults(id) on delete cascade,
  room_label    text not null,             -- e.g. "Room A - Payroll"
  access_wallet text,                      -- wallet granted restricted access
  status        text not null default 'active' check (status in ('active','locked')),
  created_at    timestamptz not null default now()
);

-- TRANSACTIONS
-- Every deposit, withdrawal, swap, state change — full audit trail
create table transactions (
  id              uuid primary key default gen_random_uuid(),
  vault_id        uuid not null references vaults(id),
  tx_type         text not null check (tx_type in (
                    'move_in','deposit','withdrawal',
                    'pledge','unpledge','swap',
                    'sub_vault_create','sub_vault_access',
                    'circuit_breaker','lease_payment'
                  )),
  status          text not null default 'pending' check (status in ('pending','confirmed','failed')),
  sol_amount      numeric(18,9),           -- flat fee amount, NOT vault value
  flat_fee_sol    numeric(18,9),           -- protocol fee collected
  solana_sig      text,                    -- Solana transaction signature (once live)
  monad_tx        text,                    -- Monad tx hash (once live)
  created_at      timestamptz not null default now()
);

-- SECURITY EVENTS
-- Threat detections, alarms, notifications
create table security_events (
  id              uuid primary key default gen_random_uuid(),
  locker_id       uuid references lockers(id),
  vault_id        uuid references vaults(id),
  sub_vault_id    uuid references sub_vaults(id),
  event_type      text not null check (event_type in (
                    'unusual_withdrawal','unrecognized_wallet','dvn_anomaly'
                  )),
  severity        text not null check (severity in ('sub_vault','vault','locker')),
  status          text not null default 'open' check (status in ('open','resolved','dismissed')),
  details         jsonb,
  created_at      timestamptz not null default now()
);

-- LOCKER SEED DATA
-- Insert one public locker to start
insert into lockers (locker_ref, locker_number, tier, vault_capacity)
values ('LCK-0000...001', 1, 'public', 20000);

-- ============================================================
-- Row Level Security
-- Enable RLS so users can only see their own vaults
-- ============================================================

alter table vaults enable row level security;
alter table sub_vaults enable row level security;
alter table transactions enable row level security;
alter table security_events enable row level security;

-- Vault owners can read their own vaults
create policy "owner can read own vaults"
  on vaults for select
  using (owner_wallet = current_setting('request.jwt.claims', true)::jsonb->>'wallet');

-- Vault owners can update their own vaults
create policy "owner can update own vaults"
  on vaults for update
  using (owner_wallet = current_setting('request.jwt.claims', true)::jsonb->>'wallet');

-- Anyone can read lockers (public info)
alter table lockers enable row level security;
create policy "anyone can read lockers"
  on lockers for select using (true);
