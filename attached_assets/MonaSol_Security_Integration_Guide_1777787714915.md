# MonaSol Protocol Security System — Integration Guide

## Document Purpose

This guide connects all security components (Neighborhood Watch, Dashboard, Node System, Staking Economics) into a unified operational framework. It specifies how the admin dashboard interfaces with on-chain security layers without violating MonaSol's core principle: **the protocol never holds keys, never holds NFTs, and has no custody of unlock credentials.**

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER LAYER                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Vault Owner │  │   Watcher   │  │ Multi-Sig   │  │    Ops      │        │
│  │  (NFT Key)   │  │  (Staked    │  │  Holder     │  │   Team      │        │
│  │              │  │   MSL)      │  │             │  │             │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │               │
│         │ Wallet Sign    │ Wallet Sign    │ Wallet Sign    │ Read-Only     │
│         ▼                ▼                ▼                ▼               │
├─────────────────────────────────────────────────────────────────────────────┤
│                         DASHBOARD LAYER (Read-Only + Coordination)          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    MONASOL ADMIN DASHBOARD                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │    │
│  │  │  Locker  │ │ Security │ │Governance│ │  Nodes   │ │  Notif  │ │    │
│  │  │ Explorer │ │  Panel   │ │ Console  │ │  Health  │ │ Center  │ │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │    │
│  │                                                                    │    │
│  │  ⚠️ NO ADMIN KEYS IN DASHBOARD                                    │    │
│  │  ⚠️ ALL ACTIONS REQUIRE WALLET SIGNATURE                        │    │
│  │  ⚠️ DASHBOARD CANNOT UNLOCK VAULTS                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                │                │                │               │
│         │ GraphQL Query  │ GraphQL Sub    │ GraphQL Mut    │ Webhook       │
│         ▼                ▼                ▼                ▼               │
├─────────────────────────────────────────────────────────────────────────────┤
│                      INDEXING & QUERY LAYER                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐    │
│  │   The Graph      │  │   Subgraph      │  │   Notification Service  │    │
│  │   (Monad)        │  │   (Solana)      │  │   (Off-chain relay)     │    │
│  │                  │  │                  │  │                         │    │
│  │  • Locker state  │  │  • NFT state     │  │  • Email (SendGrid)     │    │
│  │  • Vault security│  │  • MSL token     │  │  • SMS (Twilio)         │    │
│  │  • Alerts        │  │  • Watcher stake │  │  • Push (Firebase)      │    │
│  │  • Proposals     │  │  • Light client  │  │  • Discord webhooks     │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘    │
│         │                │                │                               │
│         │ RPC Call       │ RPC Call       │ Event Listener               │
│         ▼                ▼                ▼                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                        ON-CHAIN SECURITY LAYER                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              NEIGHBORHOOD WATCH CONTRACT (per Locker)               │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐     │    │
│  │  │  Watchers  │ │   Alerts   │ │ Collective │ │  Slashing  │     │    │
│  │  │  (Staked   │ │  (On-chain │ │   Locks    │ │  & Rewards │     │    │
│  │  │   MSL)     │ │   events)  │ │            │ │            │     │    │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                │                │                               │
│         │                │                │                               │
│         ▼                ▼                ▼                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              VAULT CONTRACT (per Vault)                             │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐     │    │
│  │  │    Mode    │ │   Locked   │ │  Sub-vault │ │   Auth     │     │    │
│  │  │  System/   │ │   State    │ │   Access   │ │  History   │     │    │
│  │  │   Self     │ │            │ │   Control  │ │            │     │    │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                │                │                               │
│         │                │                │                               │
│         ▼                ▼                ▼                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              CROSS-CHAIN VERIFICATION LAYER                         │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │         SOLANA LIGHT CLIENT (on Monad)                       │    │    │
│  │  │  • Merkle proof verification of NFT ownership               │    │    │
│  │  │  • No oracle, no trusted third party                        │    │    │
│  │  │  • Novel infrastructure — critical path item                │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                │                │                               │
│         │                │                │                               │
│         ▼                ▼                ▼                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              GOVERNANCE & MULTI-SIG LAYER                           │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │    │
│  │  │   Multi-Sig     │  │    Timelock       │  │  Node Registry  │    │    │
│  │  │   (Squads on    │  │   (24-72 hours)   │  │  (5-party       │    │    │
│  │  │    Solana)      │  │                   │  │   consensus)    │    │    │
│  │  │                 │  │                   │  │                 │    │    │
│  │  │  • 3-of-5       │  │  • Proposal     │  │  • Health       │    │    │
│  │  │    threshold    │  │    delay        │  │    scores       │    │    │
│  │  │  • Proposals    │  │  • User exit    │  │  • Failover     │    │    │
│  │  │  • Signatures   │  │    window       │  │  • Rotation     │    │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Specifications

### 1. Vault Owner → Dashboard → Vault (Self-Mode Lock/Unlock)

```
User clicks "Lock Vault" in Dashboard
    │
    ▼
Dashboard prepares transaction calldata
    │
    ▼
User wallet (Phantom/Backpack) prompts for signature
    │
    ▼
Signature submitted to Monad RPC
    │
    ▼
Vault Contract verifies:
    ├── NFT ownership proof (via Light Client)
    ├── Vault is in Self mode
    └── Caller owns the NFT
    │
    ▼
Vault state updated: locked = true
    │
    ▼
Event emitted: VaultLocked(locker, vault_id, false, "Owner initiated")
    │
    ▼
Subgraph indexes event
    │
    ▼
Dashboard updates UI (shows "Locked" badge)
    │
    ▼
Notification service sends confirmation to owner
```

**Critical:** Dashboard never sees the private key. It only prepares the transaction. The wallet signs it.

---

### 2. Watcher → Dashboard → Neighborhood Watch (Alert Reporting)

```
Watcher observes suspicious on-chain activity
    │
    ▼
Watcher clicks "Report Alert" in Dashboard
    │
    ▼
Dashboard prepares alert transaction:
    ├── locker_address
    ├── vault_id
    └── alert_type (e.g., "UNUSUAL_PATTERN")
    │
    ▼
Watcher wallet signs transaction
    │
    ▼
Neighborhood Watch Contract verifies:
    ├── Caller is active watcher
    ├── Stake >= 10,000 MSL
    └── Reputation >= 200
    │
    ▼
Alert stored on-chain with unique ID
    │
    ▼
Event emitted: SecurityAlert(alert_id, locker, vault_id, reporter, type, severity)
    │
    ▼
IF severity >= 4 AND vault mode == SYSTEM:
    ├── Collective lock initiated
    ├── All System-mode vaults in locker locked
    └── Event: CollectiveLockTriggered(locker, reporter, count, reason)
    │
    ▼
Subgraph indexes alert
    │
    ▼
Dashboard shows alert in real-time feed
    │
    ▼
Notifications sent to:
    ├── Vault owners (email/SMS)
    ├── Multi-sig holders (push/pager)
    └── Discord #security-alerts
```

---

### 3. Multi-Sig Holder → Dashboard → Governance (Proposal Execution)

```
Multi-sig holder reviews pending proposal in Dashboard
    │
    ▼
Proposal details displayed:
    ├── Type: RELEASE_COLLECTIVE_LOCK
    ├── Target: 0xLockerAddress
    ├── Description: "Health restored, false positive confirmed"
    ├── Signatures: 2-of-3 collected
    └── Timelock: 18 hours remaining
    │
    ▼
Holder clicks "Sign Proposal"
    │
    ▼
Dashboard prepares signature payload
    │
    ▼
Holder wallet (Squads multi-sig) prompts for signature
    │
    ▼
Signature submitted to Multi-Sig Contract
    │
    ▼
Contract verifies:
    ├── Caller is authorized signer
    └── Proposal exists and is active
    │
    ▼
Signature count incremented
    │
    ▼
IF threshold reached (3-of-5):
    ├── Proposal status → TIMELOCKED
    └── Timelock countdown begins
    │
    ▼
After timelock expires:
    ├── Any signer can execute
    └── Calldata sent to target contract
    │
    ▼
Target contract executes:
    └── release_collective_lock(locker)
    │
    ▼
Event: CollectiveLockReleased(locker, executor, timestamp)
    │
    ▼
Subgraph indexes
    │
    ▼
Dashboard updates: locker shows "Unlocked", green status
```

---

### 4. Ops Team → Dashboard → Node System (Rotation Monitoring)

```
Ops team opens Node Health page in Dashboard
    │
    ▼
Dashboard queries Node Registry Contract
    │
    ▼
Real-time health scores displayed:
    ├── Node-A1: 972 (Healthy)
    ├── Node-A2: 948 (Warning — approaching 95% threshold)
    ├── Node-P1: 915 (Warning)
    ├── Node-P2: 961 (Healthy)
    └── Node-P3: 983 (Healthy)
    │
    ▼
Ops team sees Node-A2 trending down
    │
    ▼
Dashboard shows: "Rotation due in 4 hours"
    │
    ▼
Ops team CANNOT manually rotate
    │
    ▼
Rotation is automatic at T+4 hours
    │
    ▼
Dashboard displays countdown timer
    │
    ▼
At T+0:
    ├── Dashboard shows "Rotation in progress"
    ├── Node-A2 stops accepting challenges
    ├── Backup A2-B activated
    └── New backup provisioned
    │
    ▼
At T+5 minutes:
    ├── Dashboard shows "Rotation complete"
    ├── Node-A2 now dormant (A2-B)
    └── A2-B now active
    │
    ▼
Ops team verifies via Dashboard:
    ├── New active node health score baseline
    └── All systems green
```

**Critical:** Ops team monitors but does not control. Rotation is algorithmic.

---

## API Endpoints (Dashboard ↔ Protocol)

### Read Endpoints (No Authentication Required)

```graphql
# Get all lockers with security status
query GetLockers($tier: String, $skip: Int, $first: Int) {
  lockers(tier: $tier, skip: $skip, first: $first) {
    id
    tier
    vaultCount
    tvl
    healthScore
    collectiveLockActive
    neighborhoodWatch {
      activeWatcherCount
      totalAlerts24h
    }
    securityBadges {
      badgeType
      earnedAt
    }
  }
}

# Get single vault with full security context
query GetVault($id: ID!) {
  vault(id: $id) {
    id
    vaultId
    mode
    locked
    lastAuth
    authFailures
    subVaults {
      name
      purpose
      authorizedAddresses
      lastAccessed
    }
    locker {
      healthScore
      collectiveLockActive
    }
  }
}

# Get real-time alert feed
query GetAlerts($lockerId: ID, $severity: Int, $resolved: Boolean) {
  alerts(lockerId: $lockerId, severity: $severity, resolved: $resolved) {
    id
    reporter {
      id
      reputationScore
    }
    alertType
    severity
    timestamp
    resolved
    valid
  }
}

# Get node health status
query GetNodeHealth($nodeId: ID) {
  nodeHealth(nodeId: $nodeId) {
    id
    role
    healthScore
    status
    lastSignature
    uptime
    nextMandatoryRotation
    backupNode
    backupStatus
  }
}
```

### Write Endpoints (Require Wallet Signature)

```graphql
# Watcher registers (requires MSL stake + wallet signature)
mutation RegisterWatcher($stakeAmount: String!, $backupNode: String!) {
  registerWatcher(stakeAmount: $stakeAmount, backupNode: $backupNode) {
    id
    isActive
    stake
    reputationScore
  }
}

# Watcher reports alert (requires watcher wallet signature)
mutation ReportAlert($lockerAddress: String!, $vaultId: Int!, $alertType: String!) {
  reportAlert(lockerAddress: $lockerAddress, vaultId: $vaultId, alertType: $alertType) {
    id
    severity
    timestamp
    locker {
      collectiveLockActive
    }
  }
}

# Vault owner self-locks (requires NFT owner wallet signature)
mutation SelfLockVault($vaultId: ID!) {
  selfLockVault(vaultId: $vaultId) {
    id
    locked
    mode
  }
}

# Multi-sig holder creates proposal (requires signer wallet signature)
mutation CreateProposal($type: ProposalType!, $target: String!, $description: String!, $calldata: String) {
  createProposal(proposalType: $type, target: $target, description: $description, calldata: $calldata) {
    id
    status
    threshold
    timelockEnd
  }
}

# Multi-sig holder signs proposal (requires signer wallet signature)
mutation SignProposal($proposalId: ID!) {
  signProposal(proposalId: $proposalId) {
    id
    signatures
    status
  }
}
```

---

## Security Boundaries

### What the Dashboard CAN Do
✅ Display on-chain state (read-only)
✅ Prepare transaction calldata (does not sign)
✅ Show real-time alerts and notifications
✅ Coordinate multi-sig proposal workflow
✅ Monitor node health and rotation schedules
✅ Send off-chain notifications (email, SMS, push)

### What the Dashboard CANNOT Do
❌ Store private keys or admin credentials
❌ Sign transactions on behalf of users
❌ Unlock any vault (even with "admin" login)
❌ Override collective locks
❌ Skip timelock periods
❌ Slash or reward watchers (only multi-sig can)
❌ Activate backup nodes (algorithmic only)
❌ Modify on-chain state without wallet signature

---

## Deployment Checklist

### Pre-Deployment
- [ ] Neighborhood Watch contract deployed on Monad testnet
- [ ] Multi-sig contract (Squads) configured with 5 known addresses
- [ ] Timelock contract deployed with 24-hour minimum delay
- [ ] Node Registry contract deployed
- [ ] Subgraph indexing configured for all relevant events
- [ ] Dashboard built with no admin key storage
- [ ] Wallet adapter tested (Phantom, Backpack, Solflare)
- [ ] Notification service configured (SendGrid, Twilio, Firebase)

### Testnet Testing
- [ ] Create test vault, mint NFT on Solana devnet
- [ ] Report test alert as watcher, verify slash/reward logic
- [ ] Trigger test collective lock, verify System-mode behavior
- [ ] Test Self-mode lock/unlock with NFT signature
- [ ] Create multi-sig proposal, collect signatures, execute after timelock
- [ ] Simulate node health degradation, verify automatic failover
- [ ] Test mandatory rotation, verify collision guard
- [ ] Verify dashboard shows all events in real-time

### Mainnet Deployment
- [ ] All contracts audited by 2 independent firms
- [ ] Multi-sig holders use hardware wallets (Ledger/Trezor)
- [ ] Backup nodes in 3+ different geographic regions
- [ ] Monitoring service runs on independent infrastructure
- [ ] Incident response plan documented and tested
- [ ] Bug bounty program live (Immunefi or similar)
- [ ] Legal review of MSL token structure complete

---

## Operational Runbooks

### Runbook 1: Collective Lock Triggered
**Symptom:** Dashboard shows "LOCKED" banner on locker.

**Steps:**
1. Check alert feed for triggering event
2. Verify alert validity (was it a real threat or false positive?)
3. If false positive:
   a. Multi-sig creates proposal to release lock
   b. Collect 3-of-5 signatures
   c. Wait for timelock
   d. Execute release
4. If real threat:
   a. Investigate scope (which vaults affected?)
   b. Notify affected vault owners
   c. Coordinate with security team
   d. Prepare post-incident report
5. Document in incident log

### Runbook 2: Node Failover
**Symptom:** Dashboard shows node in "Failed" status, backup activated.

**Steps:**
1. Verify backup node health score >= threshold
2. Check original node (network issue? hardware failure? compromise?)
3. If network/hardware: restart/replace original node
4. If suspected compromise:
   a. Isolate original node immediately
   b. Rotate ALL node credentials
   c. Engage security firm for forensics
   d. Consider protocol-wide pause
5. Update node registry with new active node
6. Schedule rotation of new node within 120 hours

### Runbook 3: Watcher Slash Appeal
**Symptom:** Watcher submits appeal via Dashboard.

**Steps:**
1. Review appeal evidence (transaction hashes, timestamps)
2. Multi-sig discusses in private channel (7 days)
3. Vote: Uphold, Reduce, or Reverse
4. If Reverse: return slash amount + appeal bond
5. If Reduce: return partial amount
6. If Uphold: burn slash + bond
7. Update watcher reputation accordingly
8. Document decision on-chain

---

## Glossary

| Term | Definition |
|------|------------|
| **Neighborhood Watch** | On-chain security layer with staked watchers who report threats |
| **Collective Lock** | Automatic lock of all System-mode vaults in a locker |
| **Self Mode** | Vault owner controls lock/unlock individually |
| **System Mode** | Vault participates in collective security (auto-lock on threats) |
| **Watcher** | Staked MSL holder who monitors and reports security events |
| **Slash** | Economic penalty (MSL burn) for false positive alerts |
| **Multi-Sig** | Multi-signature contract requiring threshold of signers |
| **Timelock** | Mandatory delay between proposal passage and execution |
| **Light Client** | On-chain verification of Solana state without full node |
| **Sub-Vault** | Partitioned section within a vault with delegated access |
| **Node** | Infrastructure component (Active Wallet, Approver, Backup) |
| **Failover** | Automatic switch to backup node when primary fails |
| **Rotation** | Mandatory periodic replacement of active nodes |
| **Collision Guard** | Rule preventing simultaneous failover and rotation |

---

*MonaSol Protocol Security System — Integration Guide v1.0*
*© 2026 Cooperanth Consulting LLC*
