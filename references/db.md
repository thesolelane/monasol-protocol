# Database — Schema & Migration Guide

## Overview

The project uses **Drizzle ORM** with a PostgreSQL database managed via the
`@workspace/db` package (`lib/db/`).

Schema source: `lib/db/src/schema/`  
Drizzle config: `lib/db/drizzle.config.ts`

---

## Adding or changing a table

1. **Edit the schema** in `lib/db/src/schema/`.  
   Each domain should have its own file (e.g. `watch.ts`, `schema.ts`).  
   Export every new table, insert schema, and type from `lib/db/src/schema/index.ts`.

2. **Push the change** to the database:

   ```bash
   cd lib/db
   pnpm run push          # interactive — confirms before applying
   pnpm run push-force    # non-interactive (CI / when you are sure)
   ```

   `drizzle-kit push` compares the live database schema against the Drizzle
   schema definitions and applies the diff.  It does **not** produce SQL
   migration files; changes are applied directly to the connected database.

3. **Rebuild the lib** so TypeScript picks up the new types:

   ```bash
   pnpm run typecheck:libs   # from the workspace root
   ```

---

## Watch tables (Task #21)

The following tables persist Neighborhood Watch node registrations so they
survive server restarts:

### `watch_nodes`

Primary table for registered watcher nodes.

| Column | Type | Notes |
|---|---|---|
| `wallet_address` | `text` PK | Solana base58 or EVM `0x…` address |
| `chain` | `text` | `"solana"` or `"monad"` |
| `x_handle` | `text` | Twitter/X handle (no `@`) |
| `telegram_handle` | `text` | Telegram username |
| `discord_handle` | `text` | Discord handle |
| `device_public_key` | `text` | Ed25519 public key hex (64 chars) used to verify report signatures |
| `status` | `text` | `PENDING` → `ACTIVE` → `DEACTIVATED` / `REJECTED` |
| `rejection_reason` | `text?` | Set when status is `REJECTED` or `DEACTIVATED` |
| `tier` | `integer` | Node tier (default 1) |
| `registered_at` | `timestamp` | Set at insert |
| `verification_due` | `timestamp` | 48 h after registration; background worker checks after this |
| `uptime_start` | `timestamp` | Reset to `now()` when node becomes ACTIVE |
| `report_count` | `integer` | Lifetime reports submitted |
| `locker_count` | `integer` | Distinct lockers monitored |
| `consecutive_failed_checks` | `integer` | Deactivates at ≥ 2 |
| `next_recheck_at` | `timestamp` | Background worker re-verifies after this date |
| `updated_at` | `timestamp` | Updated on every write |

### `watch_nonces`

Stores report nonces for replay-attack prevention.  Each nonce is unique per
wallet and is pruned when it is older than the TTL window (5 minutes).

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `gen_random_uuid()` |
| `wallet_address` | `text` | Owner wallet |
| `nonce` | `text` | Random hex nonce from report payload |
| `created_at` | `timestamp` | Used for TTL deletion |

**Indexes:**
- `watch_nonces_wallet_nonce_idx` — unique on `(wallet_address, nonce)` to reject duplicate nonces at DB level
- `watch_nonces_created_at_idx` — on `created_at` to make TTL-based `DELETE … WHERE created_at < $expiry` efficient

The route handler deletes expired nonces before inserting a new one:

```sql
DELETE FROM watch_nonces
WHERE wallet_address = $wallet AND created_at < now() - interval '5 minutes';
```

### `watch_reports`

Audit trail of accepted anomaly reports submitted by ACTIVE nodes.

### `watch_audit_log`

Security-sensitive event log (registrations, rejections, auth failures, etc.).

---

## Applying schema changes to production

After running `pnpm run push` in development, apply the same command against
the **production** `DATABASE_URL`:

```bash
DATABASE_URL="<prod-connection-string>" pnpm --filter @workspace/db run push
```

> Always snapshot/backup production data before running schema changes on live
> traffic.

---

## Running queries in development

Use `drizzle-kit studio` for a local GUI, or connect with any PostgreSQL client
using the `DATABASE_URL` from the Replit Secrets panel.
