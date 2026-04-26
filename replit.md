# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `artifacts/api-server/` | `/api` | Express 5 backend API server |
| `artifacts/monasol-protocol/` | `/` | Monasol Protocol DeFi frontend (React + Vite) |
| `artifacts/mockup-sandbox/` | `/__mockup` | UI design/mockup sandbox |

## Monasol Protocol

Cross-chain vault management interface — locks EVM tokens controlled by Solana NFTs.

- **Frontend**: `artifacts/monasol-protocol/src/` — React + Vite, Tailwind v4, Space Grotesk + Inter fonts, dark theme
- **Theme**: Custom dark theme with Monad purple (`hsl(265 89% 66%)`) and Solana green (`hsl(154 100% 50%)`)
- **Pages**: Home (`/`), Admin (`/admin`), Swap (`/swap`), Events (`/events`)
- **Backend**: Stubbed — user storage in `artifacts/api-server/src/storage.ts` (ready for DB integration)
