# MonaSol Node Health, Failover & Rotation System

## Architecture Overview

The 5-Party Consensus system ensures no single point of failure for critical protocol operations. This document specifies the health monitoring, automatic failover, and mandatory rotation mechanics.

---

## Node Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSENSUS CLUSTER                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐               │
│  │  ACTIVE WALLET 1 │    │  ACTIVE WALLET 2 │               │
│  │  (Primary Signer)│    │  (Primary Signer)│               │
│  │  Health: 95%+     │    │  Health: 95%+     │               │
│  │  Backup: A1-B     │    │  Backup: A2-B     │               │
│  └────────┬────────┘    └────────┬────────┘               │
│           │                      │                         │
│           ▼                      ▼                         │
│  ┌─────────────────────────────────────────────┐           │
│  │         APPROVER LEDGERS (3)               │           │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐     │           │
│  │  │Approver1│ │Approver2│ │Approver3│     │           │
│  │  │Health:  │ │Health:  │ │Health:  │     │           │
│  │  │  90%+   │ │  90%+   │ │  90%+   │     │           │
│  │  │Backup:  │ │Backup:  │ │Backup:  │     │           │
│  │  │Pool-B1  │ │Pool-B2  │ │Pool-B1  │     │           │
│  │  └─────────┘ └─────────┘ └─────────┘     │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │         BACKUP POOL (2 shared)              │           │
│  │  ┌─────────┐    ┌─────────┐                  │           │
│  │  │Pool-B1  │    │Pool-B2  │                  │           │
│  │  │(dormant)│    │(dormant)│                  │           │
│  │  │Encrypted│    │Encrypted│                  │           │
│  │  └─────────┘    └─────────┘                  │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Node Roles

| Role | Count | Health Threshold | Function | Backup |
|------|-------|-----------------|----------|--------|
| Active Wallet | 2 | 95% | Primary transaction signing | 1 dedicated each |
| Approver | 3 | 90% | Secondary signing, governance | Shared pool of 2 |
| Backup | 4 total | N/A | Dormant until activated | N/A |

---

## Health Score Calculation

### Formula
```
Health Score = (Uptime_Component * 0.5) + (Signature_Success_Component * 0.5)

Where:
- Uptime_Component = (successful_pings / total_pings) * 1000
- Signature_Success_Component = (successful_signatures / signature_requests) * 1000
- Sampled every 10 minutes
- Rolling window: 24 hours
```

### Component Breakdown

#### Uptime (50% weight)
```
Every 10 minutes, the monitoring service sends a challenge:
- Challenge: random nonce + timestamp
- Expected response: signature of challenge within 30 seconds
- Success: response valid and on-time
- Failure: no response, invalid signature, or timeout

Uptime = (successful_challenges_last_24h / total_challenges_last_24h) * 1000
```

#### Signature Success (50% weight)
```
When a real signature is requested:
- Track: request sent → response received
- Success: valid signature returned within deadline
- Failure: timeout, invalid signature, or error

Signature_Success = (successful_signatures_last_24h / total_requests_last_24h) * 1000
```

### Health Score Interpretation

| Score | Status | Action |
|-------|--------|--------|
| 1000 | Perfect | Normal operation |
| 950-999 | Healthy | Normal operation |
| 900-949 | Warning | Monitor closely, prepare backup |
| 850-899 | Degraded | Initiate failover to backup |
| 800-849 | Critical | Emergency pause, manual review |
| < 800 | Failed | Immediate isolation, investigation |

---

## Failover Mechanics

### Automatic Failover Triggers

#### Trigger 1: Health Drops Below Threshold
```
IF health_score < role_threshold FOR 3 consecutive samples:
    1. Alert all other nodes
    2. Activate backup node (decrypt credentials)
    3. Update on-chain node registry
    4. Begin 10-minute observation period
    5. IF backup health >= threshold: continue
       ELSE: escalate to multi-sig emergency pause
```

#### Trigger 2: No Response to Challenge
```
IF node misses 3 consecutive challenges (30 minutes):
    1. Mark node as "unresponsive"
    2. Immediate failover to backup
    3. Log incident for post-mortem
    4. Notify dashboard + on-chain event
```

#### Trigger 3: Signature Verification Failure
```
IF node returns invalid signature:
    1. Retry once (possible network issue)
    2. IF still invalid: immediate failover
    3. Flag node for investigation (possible compromise)
    4. Do NOT slash — invalid sig could be bug, not malice
```

### Failover Sequence

```
T+0:    Trigger detected (health < threshold or missed challenge)
T+0:    On-chain event emitted: "FailoverInitiated(node, reason)"
T+0:    Dashboard notification sent to all multi-sig holders
T+0:    Backup node receives activation signal (encrypted tunnel)
T+30s:  Backup node decrypts credentials, begins health checks
T+2min: Backup node submits first challenge response
T+5min: IF backup health >= threshold: failover complete
        ELSE: escalate to emergency pause
T+10min: Original node isolated, no longer receives challenges
```

### Backup Activation Security

#### Encrypted Dormant State
- Backup nodes store credentials encrypted with **threshold encryption**
- Requires 2-of-3 approver signatures to decrypt
- Decryption key shards distributed to approvers + 1 offline cold storage
- Backup node itself cannot decrypt without approver consensus

#### Activation Flow
```
1. Failover trigger detected
2. Multi-sig contract emits "BackupActivationRequest"
3. 2 approvers sign decryption authorization
4. Backup node receives decrypted credentials
5. Backup node connects to network, begins challenges
6. Original node credentials rotated (invalidated)
```

---

## Mandatory Rotation

### Schedule
- **Every active node: 120 hours (5 days) maximum continuous operation**
- **Every backup node: 240 hours (10 days) maximum dormant period**
- Rotation is mandatory regardless of health score
- Even a perfect 1000 health node MUST rotate

### Rotation Sequence

```
Phase 1: Preparation (T-2 hours)
├── New backup node provisioned (encrypted, dormant)
├── Current backup node prepared for promotion
├── Multi-sig holders notified
└── On-chain rotation scheduled

Phase 2: Pre-Rotation (T-30 minutes)
├── New backup added to registry (inactive)
├── Health checks begin on new backup
├── Current node finishes pending signatures
└── No new signature requests accepted

Phase 3: Rotation (T-0)
├── Current node stops accepting challenges
├── Backup node activated (decrypt credentials)
├── On-chain registry updated: backup → active
├── New backup registered
└── Old active node → backup (re-encrypted, dormant)

Phase 4: Verification (T+5 minutes)
├── New active node responds to challenges
├── Health score baseline established
├── Old node credentials invalidated
└── Rotation complete event emitted
```

### Collision Guard

**Critical Rule:** No node can undergo failover AND rotation simultaneously.

```
IF failover_in_progress AND rotation_scheduled_within_1_hour:
    1. Delay rotation by 2 hours
    2. Complete failover first
    3. Verify new active node stable for 1 hour
    4. Then proceed with rotation

IF rotation_in_progress AND failover_triggered:
    1. Pause rotation
    2. Complete failover
    3. Reset rotation schedule (+24 hours)
    4. Investigate why failover occurred during rotation
```

---

## Monitoring & Alerting

### Dashboard Metrics

#### Real-Time Node Grid
```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  Node   │  Role   │ Health  │ Status  │  Last   │
│         │         │  Score  │         │  Action │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ Node-A1 │ Active  │   972   │   🟢    │  2m ago │
│ Node-A2 │ Active  │   948   │   🟡    │  5m ago │
│ Node-P1 │Approver │   915   │   🟡    │  8m ago │
│ Node-P2 │Approver │   961   │   🟢    │  1m ago │
│ Node-P3 │Approver │   983   │   🟢    │ 30s ago │
│ A1-B    │ Backup  │   N/A   │   ⚪    │ dormant │
│ A2-B    │ Backup  │   N/A   │   ⚪    │ dormant │
│ Pool-B1 │ Backup  │   N/A   │   ⚪    │ dormant │
│ Pool-B2 │ Backup  │   N/A   │   ⚪    │ dormant │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

#### Health Trend Chart (24h)
- Line chart with 4 lines (2 active + 3 approvers)
- Threshold lines at 95% and 90%
- Annotations for failover events, rotations
- Zoomable to 1h, 6h, 24h, 7d

#### Rotation Schedule Calendar
- Gantt-style view of upcoming rotations
- Color-coded: green = scheduled, yellow = due soon (< 6h), red = overdue
- Click to view rotation details, history

### Alert Types

| Alert | Trigger | Recipients | Severity |
|-------|---------|------------|----------|
| Health Warning | Score < threshold for 1 sample | Multi-sig holders, ops team | Medium |
| Health Critical | Score < threshold for 3 samples | All nodes, dashboard, pager | High |
| Failover Initiated | Automatic backup activation | All multi-sig, ops, legal | Critical |
| Rotation Due | < 6 hours until mandatory rotation | Ops team | Medium |
| Rotation Overdue | > 120 hours since last rotation | All multi-sig, ops | High |
| Collision Guard | Failover + rotation conflict | All multi-sig, ops, dev team | Critical |
| Backup Activation Failed | Backup health < threshold after failover | All multi-sig, ops | Critical |
| Signature Anomaly | Invalid signature returned | Security team, ops | High |

---

## On-Chain Registry

### Node Registry Contract (Vyper)

```vyper
struct Node:
    id: bytes32
    role: uint8  # 1=Active, 2=Approver, 3=Backup
    address: address
    public_key: bytes32
    health_score: uint256
    status: uint8  # 1=Healthy, 2=Warning, 3=Degraded, 4=Critical, 5=Failed, 6=Dormant
    activated_at: uint256
    last_rotation: uint256
    next_rotation: uint256
    backup_of: bytes32  # For backups: which node they back up
    consecutive_failures: uint256
    total_signatures: uint256
    failed_signatures: uint256

nodes: public(HashMap[bytes32, Node])
active_nodes: public(DynArray[bytes32, 10])  # Max 10 active nodes
backup_nodes: public(DynArray[bytes32, 10])

# Events
event NodeRegistered:
    node_id: indexed(bytes32)
    role: uint8
    address: address
    timestamp: uint256

event HealthUpdated:
    node_id: indexed(bytes32)
    old_score: uint256
    new_score: uint256
    timestamp: uint256

event FailoverInitiated:
    failed_node: indexed(bytes32)
    backup_node: indexed(bytes32)
    reason: String[64]
    timestamp: uint256

event FailoverComplete:
    failed_node: indexed(bytes32)
    backup_node: indexed(bytes32)
    new_health: uint256
    timestamp: uint256

event RotationScheduled:
    node_id: indexed(bytes32)
    scheduled_for: uint256
    timestamp: uint256

event RotationStarted:
    node_id: indexed(bytes32)
    backup_node: indexed(bytes32)
    timestamp: uint256

event RotationComplete:
    node_id: indexed(bytes32)
    new_node: indexed(bytes32)
    timestamp: uint256

event CollisionGuardTriggered:
    node_id: indexed(bytes32)
    action: String[16]  # "DELAY_ROTATION" or "DELAY_FAILOVER"
    timestamp: uint256
```

---

## Operational Procedures

### Daily Operations
1. **Health Check Review** (Ops team, 09:00 UTC)
   - Review 24h health trend
   - Identify nodes trending toward threshold
   - Prepare backup nodes if needed

2. **Rotation Confirmation** (Ops team, before each rotation)
   - Verify new backup is provisioned and encrypted
   - Confirm multi-sig holders available for activation
   - Check no pending high-priority transactions

3. **Alert Triage** (On-call engineer)
   - Respond to health warnings within 15 minutes
   - Investigate any failover events within 1 hour
   - Document all incidents

### Incident Response

#### Level 1: Health Warning (90-94%)
- Monitor closely
- Prepare backup activation
- No immediate action required

#### Level 2: Health Critical (85-89%)
- Initiate automatic failover
- Ops team paged
- Post-failover health verification
- Incident report within 4 hours

#### Level 3: Emergency (< 85% or backup failure)
- Automatic emergency pause of affected locker
- All multi-sig holders paged
- Manual investigation required
- Potential protocol-wide pause if pattern detected
- External security firm engaged if compromise suspected

---

## Security Considerations

### Backup Node Compromise
**Risk:** Backup node is compromised while dormant, activated during failover.
**Mitigation:**
- Backup credentials encrypted with threshold scheme (2-of-3 approvers)
- Backup node cannot self-activate
- Activation requires multi-sig consensus
- First 10 minutes after activation: restricted permissions (observation only)

### Simultaneous Multi-Node Failure
**Risk:** 2+ active nodes fail simultaneously (coordinated attack or infrastructure failure).
**Mitigation:**
- Active nodes run in different data centers/cloud providers
- Different hardware/software configurations
- Geographic distribution
- If both active nodes fail: protocol pause, manual multi-sig recovery

### Rotation During Attack
**Risk:** Attacker times attack during rotation window.
**Mitigation:**
- Collision guard prevents rotation during active incidents
- Rotation windows announced 2 hours in advance (predictable = auditable)
- Short rotation windows (5 minutes typical)
- No new transactions accepted during rotation

### Insider Threat (Ops Team)
**Risk:** Ops team member triggers false failover or blocks legitimate rotation.
**Mitigation:**
- All failover triggers are algorithmic (health score), not manual
- Rotation is mandatory and automatic, not ops discretion
- Multi-sig required for any registry changes
- All actions logged on-chain, immutable
