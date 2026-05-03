# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (run before api-server typecheck)
- `pnpm --filter @workspace/db run push` — push DB schema changes to dev DB
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `artifacts/api-server/` | `/api` | Express 5 backend API server |
| `artifacts/monasol-protocol/` | `/` | Monasol Protocol DeFi frontend (React + Vite) |
| `artifacts/neighborhood-watch/` | Expo | Community watcher node mobile app |
| `artifacts/mockup-sandbox/` | `/__mockup` | UI design/mockup sandbox |

## Database Schema (`lib/db/src/schema/`)

- `schema.ts` — core protocol tables: users, lockers, nft_keys, events, ticket_tiers, vault_sessions, swap_sessions, session_history, vaults, vault_transactions, protocol_stats
- `watch.ts` — Neighborhood Watch tables: watch_nodes, watch_nonces, watch_reports, watch_audit_log

## Monasol Protocol

Cross-chain vault management interface — locks EVM tokens controlled by Solana NFTs.

- **Frontend**: `artifacts/monasol-protocol/src/` — React + Vite, Tailwind v4, Space Grotesk + Inter fonts, dark theme
- **Theme**: Custom dark theme with Monad purple (`hsl(265 89% 66%)`) and Solana green (`hsl(154 100% 50%)`)
- **Pages**: Home (`/`), Admin (`/admin`), Swap (`/swap`), Events (`/events`)
- **Admin panel**: includes Watcher Oracle section (node table + security log) at `/admin`

## Neighborhood Watch (Mobile)

Expo Router v6 app — community watcher nodes earn MSL rewards for monitoring protocol lockers.

- **App**: `artifacts/neighborhood-watch/app/` — dark theme (#09090F), Bebas Neue + Inter fonts
- **Screens**: Onboarding (welcome → wallet → socials), Pending, Rejected, Active tabs (Node/Activity/Settings)
- **Context**: `contexts/WatcherContext.tsx` — state machine (LOADING→PENDING→ACTIVE/REJECTED), device key, polling
- **API client**: `utils/api.ts` — SHA-256 signed reports, HMAC nonce

## Watch API (`artifacts/api-server/src/routes/watch.ts`)

All routes under `/api/watch/`:

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /register` | Public (rate-limited 5/hr/IP) | Register a watcher node |
| `GET /status/:address` | Public (rate-limited 120/min/IP) | Get node status, triggers lazy verification |
| `POST /report` | Node signature | Submit anomaly report (rate-limited 200/15min/IP) |
| `POST /device` | None | Rotate device public key |
| `GET /nodes` | Admin secret | List all nodes |
| `GET /audit` | Admin secret | Recent security audit log |
| `GET /flags` | Admin secret | Read feature flags |
| `PUT /flags` | Admin secret | Update feature flags |

### Security layers
- **IP rate limiting** (`express-rate-limit`) on all endpoints
- **Admin brute-force lockout**: 5 failures in 15 min → 30-min IP ban (in-process Map)
- **Audit log**: every security event written to `watch_audit_log` table
- **Report signing**: SHA-256(deviceKey:nonce:timestamp:wallet:locker), verified with timingSafeEqual
- **Nonce replay prevention**: DB-backed with TTL pruning
- **Twitter fail-closed**: API errors reject the node (not approve)

### Environment variables
- `WATCH_ADMIN_SECRET` — stable admin secret (auto-generated at startup if not set)
- `VITE_WATCH_ADMIN_SECRET` — same value, for admin panel browser requests
- `TWITTER_BEARER_TOKEN` — Twitter API v2 bearer token for follow verification
- `MPROTOCOL_FOLLOW_CHECK` — `"true"` to enable @mprotocol follow requirement at startup
