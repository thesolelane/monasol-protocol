# MonaSol Dashboard — React Component Architecture

## Project Structure

```
monasol-dashboard/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Navigation: Lockers, Watchers, Governance, Nodes
│   │   │   ├── TopBar.tsx            # Wallet connect, notifications bell, MSL balance
│   │   │   └── DashboardLayout.tsx   # Main layout wrapper
│   │   ├── lockers/
│   │   │   ├── LockerCard.tsx        # Summary card for locker list
│   │   │   ├── LockerDetail.tsx      # Full locker view: TVL, health, vaults, alerts
│   │   │   ├── LockerExplorer.tsx    # Grid/list of all lockers with filters
│   │   │   ├── VaultTable.tsx        # Paginated vault list inside locker
│   │   │   ├── VaultDetail.tsx       # Single vault: mode, sub-vaults, auth history
│   │   │   ├── SubVaultMap.tsx       # Visual room layout of sub-vaults
│   │   │   └── SecurityBadge.tsx     # Badge display component
│   │   ├── security/
│   │   │   ├── AlertFeed.tsx         # Real-time alert stream
│   │   │   ├── AlertDetail.tsx       # Single alert: reporter, severity, resolution
│   │   │   ├── AlertSeverityBadge.tsx # Color-coded severity indicator
│   │   │   ├── CollectiveLockBanner.tsx # "LOCKED" banner with release countdown
│   │   │   ├── WatcherRoster.tsx     # List of active watchers with stats
│   │   │   ├── WatcherCard.tsx       # Individual watcher: stake, reputation, alerts
│   │   │   ├── StakePanel.tsx        # MSL staking/unstaking UI
│   │   │   ├── SlashAppealForm.tsx   # Form to appeal a slash (goes to multi-sig)
│   │   │   └── SecurityScoreRing.tsx # Circular health score visualization
│   │   ├── governance/
│   │   │   ├── ProposalList.tsx      # All proposals with status filters
│   │   │   ├── ProposalCard.tsx      # Summary: type, threshold, timelock countdown
│   │   │   ├── ProposalDetail.tsx    # Full proposal: signers, calldata, history
│   │   │   ├── ProposalSigner.tsx    # "Sign" button with wallet integration
│   │   │   ├── TimelockCountdown.tsx # Live countdown to execution
│   │   │   ├── MultiSigConsole.tsx   # Master multi-sig management view
│   │   │   └── EmergencyPausePanel.tsx # Circuit breaker UI (propose only)
│   │   ├── nodes/
│   │   │   ├── NodeHealthGrid.tsx    # All nodes in grid view
│   │   │   ├── NodeCard.tsx          # Single node: health, role, backup status
│   │   │   ├── HealthTrendChart.tsx  # 24h health score line chart
│   │   │   ├── RotationSchedule.tsx  # Calendar view of upcoming rotations
│   │   │   └── FailoverLog.tsx       # History of backup activations
│   │   ├── notifications/
│   │   │   ├── NotificationBell.tsx  # Badge count + dropdown
│   │   │   ├── NotificationList.tsx   # Full notification inbox
│   │   │   ├── NotificationItem.tsx   # Single notification with action links
│   │   │   └── NotificationPrefs.tsx  # Channel preferences UI
│   │   └── shared/
│   │       ├── WalletButton.tsx      # Connect wallet (Phantom, Backpack, etc.)
│   │       ├── LoadingSkeleton.tsx   # Shimmer loading states
│   │       ├── ErrorBoundary.tsx     # Crash recovery
│   │       ├── CopyAddress.tsx       # Click-to-copy with truncation
│   │       ├── TimeAgo.tsx           # Relative timestamp
│   │       ├── SolanaNFTViewer.tsx   # Display NFT metadata from Metaplex Core
│   │       └── MonadTxLink.tsx       # Link to Monad explorer
│   ├── hooks/
│   │   ├── useWallet.ts              # Wallet connection + signing
│   │   ├── useLocker.ts              # Fetch locker data from GraphQL
│   │   ├── useVault.ts               # Fetch vault data
│   │   ├── useAlerts.ts              # Alert subscription + query
│   │   ├── useWatchers.ts            # Watcher data + staking
│   │   ├── useProposals.ts           # Governance proposal management
│   │   ├── useNodeHealth.ts          # Node health polling
│   │   ├── useNotifications.ts       # Notification query + mutation
│   │   ├── useSubgraph.ts            # Generic GraphQL query hook
│   │   └── useRealtime.ts            # WebSocket subscription hook
│   ├── contexts/
│   │   ├── WalletContext.tsx         # Wallet state provider
│   │   ├── ProtocolContext.tsx       # Protocol config (chain IDs, contract addresses)
│   │   └── NotificationContext.tsx   # Toast + push notification manager
│   ├── services/
│   │   ├── graphqlClient.ts          # Apollo Client setup
│   │   ├── websocketClient.ts        # GraphQL subscriptions over WebSocket
│   │   ├── solanaRPC.ts              # Solana JSON-RPC wrapper
│   │   ├── monadRPC.ts              # Monad JSON-RPC wrapper
│   │   ├── lightClient.ts           # Solana light client proof verification
│   │   ├── notificationService.ts   # Email/SMS/push sender (backend proxy)
│   │   └── ipfsService.ts           # Metadata storage
│   ├── types/
│   │   ├── index.ts                 # All TypeScript interfaces
│   │   └── enums.ts                 # All enums
│   ├── utils/
│   │   ├── formatters.ts            # Number, address, date formatting
│   │   ├── validators.ts            # Input validation
│   │   ├── crypto.ts                # Hashing, signature verification helpers
│   │   ├── constants.ts             # Contract addresses, thresholds
│   │   └── alerts.ts                # Alert type definitions + severity mapping
│   ├── pages/
│   │   ├── index.tsx                # Dashboard home: protocol stats + recent alerts
│   │   ├── lockers/
│   │   │   ├── index.tsx            # Locker explorer
│   │   │   └── [address].tsx        # Locker detail (dynamic route)
│   │   ├── vaults/
│   │   │   └── [id].tsx             # Vault detail (dynamic route)
│   │   ├── watch.tsx                # Neighborhood Watch panel
│   │   ├── governance.tsx           # Multi-sig + proposals
│   │   ├── nodes.tsx                # Node health monitoring
│   │   ├── notifications.tsx        # Notification center
│   │   └── settings.tsx             # User preferences + wallet management
│   ├── styles/
│   │   └── globals.css              # Tailwind + custom theme
│   └── App.tsx                      # Root component with routing
├── public/
│   └── badges/                       # Badge SVG assets
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## Key Technical Decisions

### 1. Wallet-First Architecture
- No backend session or JWT. Every action requires wallet signature.
- Dashboard is a "dumb client" — all state lives on-chain, fetched via RPC/GraphQL.
- Admin actions (proposals) use Squads multi-sig on Solana, not a backend API.

### 2. Real-Time Layer
- GraphQL subscriptions via WebSocket for alerts, node health, proposals.
- Fallback to polling (5s) if WebSocket disconnects.
- Alert feed uses "sticky" notifications — critical alerts persist until acknowledged.

### 3. Cross-Chain Data Flow
```
Dashboard reads from:
├── Solana RPC → NFT state, MSL token, watcher stakes
├── Monad RPC  → Locker state, vault security, proposals
├── Subgraph   → Indexed historical data (deposits, withdrawals, alerts)
└── Light Client → Merkle proofs for NFT ownership verification
```

### 4. Notification Architecture
```
On-Chain Event → Subgraph Indexer → Webhook → Notification Service
                                                    ├── Email (SendGrid)
                                                    ├── SMS (Twilio)
                                                    ├── Push (Firebase)
                                                    └── Discord (Webhook)
```
- Notification service is a backend proxy, but it CANNOT act on-chain.
- It only delivers messages. All actions require user wallet signature.

### 5. Security UI Patterns
- **Red banner** for collective lock: spans full width, unmissable
- **Yellow warning** for health score < 95%
- **Orange alert** for unresolved alerts > 24h
- **Green badge** for verified lockers
- **Gray disabled** for Self-mode vaults that user doesn't own

### 6. Performance
- Locker list paginated (20 per page)
- Vault tables virtualized (react-window) for large lockers
- Images lazy-loaded, NFT metadata cached in localStorage
- GraphQL query batching to reduce RPC calls

## Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "next": "^14.0.0",
    "@apollo/client": "^3.8.0",
    "graphql": "^16.8.0",
    "graphql-ws": "^5.14.0",
    "@solana/web3.js": "^1.87.0",
    "@solana/wallet-adapter-react": "^0.15.0",
    "@solana/wallet-adapter-wallets": "^0.19.0",
    "ethers": "^6.8.0",
    "viem": "^1.18.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "tailwindcss": "^3.3.0",
    "recharts": "^2.9.0",
    "react-window": "^1.8.0",
    "date-fns": "^2.30.0",
    "lodash": "^4.17.0"
  }
}
```
