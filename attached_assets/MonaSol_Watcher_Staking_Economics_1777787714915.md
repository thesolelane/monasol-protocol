# MonaSol Watcher Staking & Slashing Economics

## Overview

The Neighborhood Watch security layer is economically secured through staked MSL tokens. Watchers earn rewards for valid alerts and are slashed for false positives. This creates a self-regulating security market where honest behavior is profitable and dishonest behavior is expensive.

---

## Staking Requirements

### Minimum Stake
- **10,000 MSL** (10,000 * 10^18 base units)
- Stake is locked for the duration of watcher activity
- Unstaking requires 7-day cooldown period (prevents flash exits during incidents)

### Watcher Capacity per Locker
| Locker Tier | Max Vaults | Recommended Watchers | Min Watchers for Badge |
|-------------|------------|---------------------|------------------------|
| Public      | 20,000     | 50                  | 20                     |
| Standard    | 1,000      | 15                  | 5                      |
| VIP         | 10-100     | 5                   | 3                      |
| Dedicated   | Custom     | 3                   | 2                      |

### Reputation Score System
- **Range:** 0 - 1000
- **Initial:** 500 (neutral)
- **Valid alert:** +50 (capped at 1000)
- **False positive:** -100 (floor at 0)
- **Minimum to report:** 200
- **Deactivation threshold:** < 200

---

## Reward Calculation

### Base Reward Formula
```
R = Base * (Reputation / 500) * Severity_Multiplier * Stake_Age_Multiplier

Where:
- Base = 100 MSL
- Reputation = current watcher reputation (0-1000)
- Severity_Multiplier:
  - Severity 1-2: 1.0x
  - Severity 3: 1.5x
  - Severity 4: 2.0x
  - Severity 5: 3.0x
- Stake_Age_Multiplier:
  - < 30 days: 1.0x
  - 30-90 days: 1.2x
  - 90-180 days: 1.5x
  - 180+ days: 2.0x
```

### Example Rewards
| Watcher | Reputation | Stake Age | Severity | Reward (MSL) |
|-----------|------------|-----------|----------|--------------|
| New       | 500        | 10 days   | 3        | 150          |
| Established | 700      | 60 days   | 4        | 392          |
| Veteran   | 900        | 200 days  | 5        | 900          |
| Trusted   | 1000       | 365 days  | 5        | 1000         |

### Reward Distribution
- Rewards come from **protocol fee pool** (20% of all transaction fees)
- Distributed weekly based on alert volume
- Unclaimed rewards auto-compound (staked back into watcher stake)

---

## Slashing Calculation

### Base Slash Formula
```
S = Base * (1 + False_Positive_Count) * (1 + (500 - Reputation) / 500)

Where:
- Base = 500 MSL
- False_Positive_Count = total false positives from this watcher
- Reputation = current reputation (penalty increases as reputation drops)
```

### Progressive Penalty
| False Positives | Slash Multiplier | Example Slash (MSL) |
|-----------------|------------------|---------------------|
| 1st             | 1.0x             | 500                 |
| 2nd             | 2.0x             | 1000                |
| 3rd             | 3.0x             | 1500                |
| 4th             | 4.0x             | 2000                |
| 5th+            | 5.0x             | 2500                |

### Reputation Decay
- If a watcher is inactive (no alerts) for > 90 days, reputation decays by 10/month
- Decay stops at 200 (minimum reporting threshold)
- Reactivation requires reporting a valid alert or staking additional MSL

### Emergency Slashing (No Appeal)
Certain violations result in **immediate 100% stake burn** with no appeal:
- Reporting an alert while not owning the claimed NFT vault
- Coordinated attack with other watchers (detected via correlation analysis)
- Exploiting a known contract vulnerability
- Front-running own alert for profit

---

## Economic Security Analysis

### Attack Cost: Fake Alert Spam
**Scenario:** Attacker wants to trigger false collective locks to disrupt protocol.

**Cost:**
- Stake 10,000 MSL per watcher
- Need minimum 3 watchers to trigger collective lock (VIP locker)
- Total stake at risk: 30,000 MSL
- First false positive: 500 MSL slash each = 1,500 MSL lost
- Second false positive: 1,000 MSL slash each = 3,000 MSL lost
- Third false positive: 1,500 MSL slash each = 4,500 MSL lost
- **Total after 3 attacks: 9,000 MSL burned, reputations destroyed**

**Protocol Defense:**
- Multi-sig must validate alert before collective lock persists > 1 hour
- Correlation detection: if 3+ watchers report same alert within 1 minute, auto-escalate to multi-sig review
- Attacker loses more than protocol disruption gains

### Attack Cost: Bribe Watchers
**Scenario:** Attacker bribes watchers to ignore real threats.

**Cost:**
- Must bribe > 50% of active watchers
- Each watcher earns ~500-1000 MSL/week in honest rewards
- Bribe must exceed honest earnings + risk of slash if caught
- **Estimated bribe cost: 25,000-50,000 MSL/week for Public locker**
- If caught, all bribed watchers lose stakes

**Protocol Defense:**
- Anonymous watcher selection for critical alerts (random subset)
- Cross-locker watcher rotation (watchers serve multiple lockers)
- Whistleblower reward: 50% of slashed stake to reporter

### Honest Watcher ROI
**Scenario:** Watcher operates for 1 year, reports 50 alerts.

**Assumptions:**
- 45 valid alerts (90% accuracy)
- 5 false positives (10% false positive rate)
- Average severity: 3.5
- Average stake age: 180 days
- Average reputation: 750

**Revenue:**
- 45 valid * 100 MSL base * (750/500) * 1.75 avg severity * 1.5 stake age
- = 45 * 100 * 1.5 * 1.75 * 1.5 = **17,719 MSL**

**Costs:**
- 5 false positives: 500 + 1000 + 1500 + 2000 + 2500 = **7,500 MSL**
- Opportunity cost of 10,000 MSL stake: negligible (stake is returned)

**Net Profit:** 17,719 - 7,500 = **10,219 MSL/year**
**ROI:** 102.2% annually (excluding MSL price appreciation)

---

## Slashing Appeal Process

### Step 1: Appeal Submission (Watcher)
- Submit within 7 days of slash
- Bond: 1,000 MSL (returned if appeal successful, burned if rejected)
- Provide evidence: transaction hashes, timestamps, rationale

### Step 2: Multi-Sig Review (Protocol)
- 3-of-5 multi-sig reviews evidence
- 14-day review period
- Decision: Uphold, Reduce, or Reverse slash

### Step 3: Community Override (Extreme Cases)
- If multi-sig is compromised, MSL stakers can override
- Requires > 51% of staked MSL voting against multi-sig decision
- 30-day voting period
- Rarely used, exists as nuclear option

---

## Parameter Governance

All economic parameters are governed by MSL stakers (not the team):

| Parameter | Current Value | Governance Threshold |
|-----------|---------------|----------------------|
| Min Stake | 10,000 MSL    | 66% staker approval  |
| Base Reward | 100 MSL     | 51% staker approval  |
| Base Slash | 500 MSL      | 66% staker approval  |
| Cooldown Period | 7 days   | 51% staker approval  |
| Deactivation Rep | 200     | 51% staker approval  |
| Severity 5 Multiplier | 3x | 51% staker approval |

**Parameter changes require:**
1. Proposal submitted by watcher with > 800 reputation
2. 7-day discussion period
3. 14-day voting period
4. 66% approval for security-critical params, 51% for economic params
5. 3-day timelock before activation

---

## Implementation Notes

### On-Chain Storage Optimization
- Watcher struct: ~200 bytes per watcher
- 100 watchers per locker: ~20KB storage
- Alert struct: ~150 bytes per alert
- 1000 alerts/day per locker: ~150KB/day
- **Solution:** Archive alerts > 90 days to IPFS, keep hash on-chain

### Gas Optimization
- Batch reward distribution: weekly, not per-alert
- Slash calculations use pre-computed lookup tables
- Reputation updates batched at end of epoch (24 hours)

### Front-Running Protection
- Alert submission includes commit-reveal scheme
- Hash of alert details submitted first, revealed after 1 block
- Prevents watchers from copying each other's alerts
