# MonasolProtocol — Architectural Design Document
**Cooperanth Consulting LLC**
**Document version: v4.0 — May 2026**

> This document covers deployed on-chain state, live transaction proofs, and the full architectural design through v4.0. It supersedes all prior concept documents.

---

## 1. Overview

MonasolProtocol (formerly NexusBridge) is a cross-chain vault custody system where EVM assets on Monad are controlled exclusively by Solana NFT keys. Ownership of a Metaplex Core NFT on Solana is the sole credential that authorises access to a corresponding smart account vault on Monad.

**Core insight:** MonasolProtocol does not move money. It moves the deed to the vault.

**Custody guarantee:** MonasolProtocol never holds the NFT, never holds a complete key, and never has custody of any unlock credential. The user holds the NFT in their own Solana wallet at all times. What the oracle network holds are verification shards and vault-mapping data — neither of which can unlock anything independently.

The system operates across three layers:

| Layer | Chain | Role |
|-------|-------|------|
| NFT Key | Solana | Proof of ownership — the credential |
| Oracle Network | Off-chain | Bridge — reads Solana, writes to both chains |
| Vault | Monad (EVM) | Asset custody — ERC-4337 smart account |

**Phase 2 upgrade path:** The oracle network is Phase 1. Phase 2 replaces it with a Solana Light Client deployed directly on Monad — tracking Solana validator signatures and block headers on-chain, verifying Merkle proofs of NFT ownership with no intermediary. This is the same security model used by Ethereum's Beacon Chain light clients and IBC in the Cosmos ecosystem. The light client requires an independent formal security audit before deployment.

---

## 2. Deployed Programs & Contracts

### Solana — Devnet

| Program | Address |
|---------|---------|
| vault_key | `3K4trP738zH8AnLstw3aMRhLVr2bUPXbhGuFBoTFVMfu` |
| guardian_multisig | `F2Rfbcq5jRPtvqs9E746P5dJ19LruD7htYwohVNTXFuf` |
| monasol_protocol | `F6tpGzZqxCeESXDTquUrTZyMpv8WVZ5Aiem1mfiPQftY` |

### Monad — Testnet (Chain ID: 10143)

| Contract | Address |
|----------|---------|
| OracleVerifier | `0xf3bBaD99729835Cd51907726D37689556f7B496c` |
| VaultFactory | `0x6337C908CDa601E64b3f68FBf5eC6784f5978daC` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| LockerFactory | `0xaB79c384940ecb645E834dAF5fd53e6e6B7381a9` |
| TreasurySplitter | `0x05CB1E79abeD1aBfB639AE884Edbee2D84c55FB4` |

### Monad — Deployed Lockers

| ID | Address | Capacity | Tier |
|----|---------|----------|------|
| 0 | `0xdA483b1A0512401D3AC5644eBD5258d82F76A125` | 20,000 | Public |
| 1 | `0x41A7725623c6340bd0bd885aC54957Cfd0c827c5` | 20,000 | Public |
| 2 | `0x2D47dE2b8DAE59eEAE982153cF7846D24F361DF7` | 1,000 | Standard |
| 3 | `0x1972cA686116991D674c183D55D02561c390f51F` | 100 | VIP |
| 4 | `0x0cF28cE9dC4572320E1A9D109BeA2B0b087Cd802` | 50 | VIP |

### Authorized Signers

| Role | Address / Pubkey | Chain | Key type |
|------|-----------------|-------|----------|
| Deployer / Monad oracle signer | `0x9D5f3691c56859EF30555572943Fe5eaCC26364F` | Monad | ECDSA secp256k1 |
| Solana oracle node | `AgHd4vLyF2PyKzRNVdfhXKYFZmp9C3DoVa8tMdxDfEKG` | Solana | Ed25519 |

**Important:** These are two different keypairs on two different elliptic curves. The Monad oracle signer is whitelisted in `OracleVerifier.approvedSigners` (threshold=1 currently, pre-mainnet target is threshold=3 with 8 oracle signers). The Solana oracle node is whitelisted in the `oracle_verifier` PDA.

---

## 3. Live On-Chain Proofs

All transactions below are confirmed and independently verifiable.

### Solana Devnet

| Action | Transaction | Result |
|--------|------------|--------|
| Protocol initialised (`initialise`) | `HerRUTJvhdMmjsgZ5FuNRuUvqo3LFVpbYSDUQWcKG3nhM79TSvXh1fFW2yWL1H8V3pJxhuJkwm6Fpnbun4Em9Eg` | oracle_verifier + protocol_state PDAs created |
| register_session leaseId=1 | `864f2Xrbu51kDB8M75aQRMSv18MsGTPWYyRqj2B1rPeZDKxgbWeGzcTWEafBGR7FRnhdhRHcgvGzkH5eb6jcG4B` | SessionRecord written, state=active |
| register_session leaseId=2 | `3Gt8K48vjzhzxVbLy1TDQ3tfNzwFB846vXdbbuYNozDHVAigEZw6srNxRw3aRxTxnfWqksRXXQ5yK8voSeNA6PpH` | SessionRecord written, state=active |

### Monad Testnet

| Action | Transaction | Block | Gas |
|--------|------------|-------|-----|
| deployVault (locker 0, slot 0) | `0xf84ba9976be40fcca9ce7a6c8216c43fc3549fa57697ecb284261fcd2498e047` | 29,138,330 | 332,000 |
| move_in (locker 0, slot 0) | `0x7d2c953f61d9ce37007eafcb9a95089646c119c54b6cf4e104790ecc90704084` | 29,138,340 | 400,000 |
| open_session (vault `0x9e319C8a...`) | `0xb6349ff9165c77ff4578b93039ba3fb211568b41986e617680b63bf6c29f6072` | 29,138,467 | 140,000 |

**Live vault address:** `0x9e319C8a72D75D304Ace54E7Dc457D0AEcf06692`

---

## 4. Locker Architecture — Blast Radius Containment

### 4.1 The Apartment Building Model

Instead of a single monolithic contract holding all user funds (a honeypot), the protocol deploys isolated smart contracts called **Lockers**. A fire in one building does not affect any other.

- Each **Locker** is a standalone smart contract at its own unique on-chain address. There is no shared state between Lockers.
- Inside each Locker are individual **Vaults**. Vault numbers are local to the Locker — not global. The full address of any vault is always `Locker # + Vault #`. In production these are large integers abbreviated in the UI as `LCK-4891...203 → VLT-38847...291`, following the same convention used for wallet addresses.
- Vault numbers within a Locker are not assigned consecutively. Proximity in address space does not imply proximity in vulnerability.
- Inside each Vault, the owner can create **Sub-vaults** (Rooms) for granular internal access control.

### 4.2 Locker Tiers

| Tier | Vault capacity | Lease cost | Use case |
|------|---------------|------------|----------|
| Public | Up to 20,000 | Lowest (split across many tenants) | Retail |
| Standard | Up to 1,000 | Mid-range | SME / protocol treasury |
| VIP | 10–100 | Higher (few tenants share security cost) | Institutional |
| Dedicated | Custom | Negotiated | Single org, private Locker |

### 4.3 Three-Tier Blast Radius Containment

| Breach level | Who is affected | Notification type |
|---|---|---|
| Sub-vault (a Room) | That sub-vault only | Full alarm to vault owner |
| Vault (an apartment) | That vault only | Full alarm to vault owner; building watch to other vault owners in same Locker |
| Locker (the building) | All vaults in that Locker | Full alarm to all vault owners in that Locker; neighborhood watch to all other Lockers |

A **building watch** notification is informational — something occurred in your building, your apartment is unaffected. No action required, no vault locked. A **neighborhood watch** is also informational — something occurred in the protocol, your building is clean. No breach at any level triggers any response outside its containment boundary.

---

## 5. Vault Architecture

### 5.1 Individual Vault Encryption

Even if an attacker breaches a Locker contract, they do not gain automatic access to any vault. Every vault is independently secured by a cryptographic key commitment derived from the Solana NFT's token ID and the owner's off-chain secret — neither value alone is sufficient. Key derivation uses SHA-256 or SHA-512. Compromising one vault's key reveals nothing about any other.

### 5.2 Sub-Vault Rooms Model

Inside a single vault, the owner can create distinct **sub-vaults** (Rooms). This enables granular delegated access without exposing the full principal.

**Example:** A treasury holds $5M USDC. The CFO holds a restricted sub-key that opens only Room A (10,000 USDC for operational payroll). Room B (the $5M reserve) is mathematically inaccessible to that restricted key. The CEO holds the master key to the whole vault.

Sub-vault types and their enforcement rules:

| Type | Purpose | Restriction |
|------|---------|-------------|
| FUNDS | General asset custody | None |
| SWAP | DEX interaction | Token transfers only |
| DOCS | Document hash registry | Blocks token transfers |
| PAYMENTS | Recurring disbursements | None |
| LEDGER | Read-only audit trail | All writes blocked |

### 5.3 On-Chain Opacity

Vault contents are not visible on the EVM side. An observer can see that a vault exists and which Locker it belongs to, but cannot determine the assets held inside without the owner generating a cryptographic Access Key for the protocol explorer.

This is **on-chain opacity** — enforced by smart contract architecture. It is not zero-knowledge privacy in the cryptographic sense (ZK proofs are not used in Phase 1).

### 5.4 Security Modes — User-Owned Circuit Breakers

MonasolProtocol has no platform-wide admin freeze capability. Every vault owner makes a one-time security mode selection at vault setup. This preference is stored in their vault config on-chain.

#### System Mode

The user pre-authorizes collective protection within their Locker. When a threat event is confirmed at the Locker level, every System-mode vault within that same Locker locks simultaneously. Vaults in other Lockers are completely unaffected. No notification is sent first — the user opted into this behaviour at setup. The vault remains locked until the system returns green, at which point it unlocks automatically.

This is not an admin action. System-mode users voluntarily pre-authorized the collective lock by choosing this mode. The authorization lives in their vault config, not in any platform key.

#### Self Mode

When a threat event fires, the user receives an on-device alarm with two explicit options:

- **Lock my vault** — vault immediately enters frozen state
- **Deny** — user dismisses the alarm, vault remains operational

If the user does not respond within the configured timeout window, the vault enters a **degraded state**: read-only access only, all withdrawals blocked. It remains degraded until monitoring shows green, at which point normal operation resumes automatically. MonasolProtocol never unilaterally locks a Self-mode vault — it can only degrade it. The user retains the final lock decision.

#### Threat Detection Triggers

The on-chain monitoring system watches for:

- Unusual withdrawal patterns or amounts relative to historical behaviour
- An unrecognized wallet attempting to access the vault
- Oracle bridge anomalies — irregular cross-chain message patterns, oracle manipulation attempts, or relay failures

---

## 6. Session Lifecycle

```
ACTIVE → PLEDGED → SETTLING → RELEASED → CLOSED
```

| State | Description | Trigger | Actor |
|-------|-------------|---------|-------|
| Active | Normal operation. NFT holder can unlock the vault. | `register_session` called by oracle | Oracle |
| Pledged | Vault frozen pending an ownership event (sale, DeFi deposit, transfer). Unlocks blocked. | User initiates sale / transfer | User / Oracle |
| Settling | Ownership proof being submitted and verified. | Monad settlement event confirmed | Oracle |
| Released | New owner's proof verified. Vault returns to Active under new control. | `confirm_settlement` called | Oracle |
| Closed | NFT burned, session finalized. | `finalize_release` called | Operator |

**Why the Pledged state exists (audit fix #4 — front-running prevention):** While a Solana NFT is being transferred to a buyer, the seller could simultaneously submit a transaction on Monad to drain the vault before the oracle recognizes the new owner. To list an NFT for sale or deposit it as DeFi collateral, the vault must first enter the Pledged state. This on-chain action is visible to any buyer and cryptographically prevents the seller from draining the vault mid-transfer.

**Dual session state:** The Vault on Monad holds its own `sessionActive` / `sessionExpiry` state separate from the Solana `SessionRecord`. Both must be kept consistent. The oracle is responsible for maintaining this consistency.

---

## 7. Oracle Network Architecture

### 7.1 Threshold Oracle Model

The protocol uses a **threshold oracle network** — no single oracle can act alone.

- N total oracles, all whitelisted on both chains
- Minimum quorum of 3 oracle signatures required per message
- Different combinations of 3 oracles serve different roles within the same locker

### 7.2 Compartmentalised Oracle Routing

Within each slot range, oracle groups are partitioned by guardian role:

```
Shard Holder A  ←  oracle group {a, b, c}        (3 oracles)
Shard Holder B  ←  oracle group {a, b, d}        (2 shared + 1 different)
Verifier        ←  oracle group {a, e, f}        (1 shared + 2 different)
```

**Security property:** To compromise a full session, an attacker must simultaneously control oracles from all three groups. Since the groups overlap but are never identical, the attacker's required set is always larger than any single group.

**Shard holder isolation:** Shard holders never communicate outside the group of 5 guardians. They are receive-only from their designated oracle group. No external messages reach them.

### 7.3 Oracle Scaling by Slot Range

Oracle groups are assigned per **slot range** within a locker — not per locker as a whole. This distributes load across the oracle network as locker capacity grows.

```
Locker (N slots)
├── Slots 0–999       → oracle group assignment A
├── Slots 1000–1999   → oracle group assignment B
├── Slots 2000–2999   → oracle group assignment C
└── ...
```

**Capacity formula:**

```
C(n, 3) = n! / (3! × (n-3)!)   — total oracle triples available

n  oracles →  C(n,3) triples  →  max slot ranges  →  max slots (batch=1,000)
8           →  56              →  18               →  18,000
16          →  560             →  186              →  186,000
32          →  4,960           →  1,653            →  1,653,000
64          →  41,664          →  13,888           →  13,888,000
```

Capacity scales **cubically** with oracle count. Adding oracles unlocks new slot ranges immediately.

### 7.4 Oracle Whitelist — Both Chains

Oracles are whitelisted on both chains simultaneously:

| Chain | Contract | Mechanism |
|-------|---------|-----------|
| Monad | OracleVerifier | `approvedSigners` mapping, threshold=3 |
| Solana | oracle_verifier PDA | Approved oracle pubkeys |

**Retiring an oracle requires admin action on both chains.** Neither chain accepts a retired oracle's signatures unilaterally.

### 7.5 Oracle Proof Format

```
digest  = keccak256(abi.encodePacked(nftMint_bytes32, owner, expiry, chainId))
proof   = signature_1 || signature_2 || signature_3   (195 bytes, threshold=3)
```

Each signature is a standard 65-byte ECDSA signature (secp256k1) over `eth_sign(digest)`.

The nftMint is encoded as the raw 32 bytes of the Solana public key — not a string encoding. A proof can only be used once, ever (`_usedProofs` mapping in OracleVerifier). The expiry window is strictly enforced at 5 minutes.

---

## 8. Guardian Set Architecture

### 8.1 Fixed 5-Guardian Protocol Set

The guardian set is **protocol-level** — fixed at 5 members regardless of locker size or slot count.

```
[0] Shard Holder A   — holds key fragment A for all assigned sessions
[1] Shard Holder B   — holds key fragment B for all assigned sessions
[2] Approver 0       — votes to approve settlement
[3] Approver 1       — votes to approve settlement
[4] Approver 2       — votes to approve settlement
```

Guardians do not scale with locker size. A single guardian can hold shard commitments for thousands of active sessions simultaneously. Adding guardians is a **protocol upgrade decision** (e.g. moving from 3-of-5 to 4-of-7 threshold), not a scaling decision.

### 8.2 Guardian Scaling vs Oracle Scaling

| Component | Scales with locker size? | Why |
|-----------|------------------------|-----|
| Oracles | Yes — more slot ranges need more oracle groups | Load distribution |
| Guardians | No — fixed 5 protocol wallets | Accumulate sessions |
| HSM keypairs | Fixed — 5 total (2 shard + 3 approver) | One set for all sessions |

### 8.3 Guardian Keypair Security

Guardian private keys are generated once at protocol genesis and stored in an off-chain HSM. Private keys never exist in server memory. The API server only ever receives and registers pubkeys.

**HSM boundary:** Guardian keypairs are generated inside the HSM. Pubkeys are registered on-chain via `init_guardian_set`. Private keys never leave the HSM.

---

## 9. Node Health, Failover & Mandatory Rotation

The five-party consensus model is only as strong as the operational health of its nodes. The protocol enforces a fully automatic, contract-driven lifecycle covering health monitoring, threshold-triggered failover, encrypted backup activation, retirement with cryptographic wipe, and mandatory 120-hour rotation.

### 9.1 Node Roster

| Role | Count | Backup Reserve | Health Threshold |
|------|-------|---------------|-----------------|
| Active Wallets (shard holders) | 2 | 1 dedicated backup per wallet | 95% |
| Approvers (guardian ledgers) | 3 | Shared pool of 2 | 90% |

All backup nodes are **dormant and encrypted** until activated by the contract. A dormant backup holds no live data and no signing keys — it is cryptographically inert until decrypted and onboarded.

### 9.2 Health Score Definition

Every active node publishes a health score computed as:

```
health_score = (uptime_rate + signature_success_rate) / 2
```

Sampled every 10 minutes over a rolling 24-hour window. Published on-chain continuously, auditable by any observer.

### 9.3 Active Wallet Failover (95% Threshold)

When an Active Wallet's health score drops below 95%, the contract automatically:

1. Decrypts and activates that wallet's dedicated backup (Backup A-1 or B-1).
2. Transfers shard data to the backup.
3. Expands the signing requirement temporarily — both the degraded wallet and its backup co-sign all transactions during the handoff window.
4. Triggers retirement of the failing wallet: full data migration to backup, followed by cryptographic wipe of all keys, shards, and ledger data.
5. Publishes a wipe receipt hash on-chain. The backup permanently assumes the active role.

Each Active Wallet has exactly one dedicated backup. There is no shared pool — the backup is reserved exclusively for its paired wallet.

### 9.4 Approver Failover (90% Threshold)

When an Approver's health score drops below 90%, the contract automatically:

1. Pulls the next available backup from the shared pool of 2, decrypts it, onboards it into the quorum.
2. The failing approver migrates its full NFT-to-vault mapping ledger to the backup.
3. The remaining healthy approvers co-sign confirming the migration is complete and the Merkle root of the received ledger matches the on-chain commitment.
4. The failing approver executes a full self-wipe: all ledger data, signing keys, and mapping data deleted. Wipe receipt hash published on-chain.
5. The backup permanently joins the active approver set. No window exists where fewer than 3 approvers are operational.

### 9.5 Backup Pool Floor

The shared backup pool must always contain at least 2 nodes:

- When a retirement reduces the pool to 1, the contract emits an on-chain alert requiring a new backup to be provisioned before any further retirement can proceed.
- When the pool reaches 0, all approver retirements are blocked entirely. No healthy approver can be rotated out until the pool is refilled.

This rule is enforced at the contract level and cannot be overridden.

### 9.6 Mandatory 120-Hour Rotation

Independent of health score, every active node — both Active Wallets and all three Approvers — rotates out of service every 120 hours. A node that is perfectly healthy at the 120-hour mark is still replaced.

Rotation sequence:
1. A new backup node is provisioned and encrypted before the timer fires.
2. Handoff window opens: outgoing and incoming node both sign all transactions in parallel.
3. Outgoing node transfers all data and keys to incoming node.
4. Outgoing node executes a full self-wipe. Wipe receipt hash published on-chain.
5. Incoming node enters active service. Quorum maintained throughout.

The rotation ensures no node accumulates enough operational history to become a high-value target for long-duration attacks.

### 9.7 Collision Guard

If a node's 120-hour rotation timer fires at the same time a health-triggered failover is in progress on the same node, the contract enforces a collision guard: one process blocks until the other completes. The health-triggered failover takes priority. The rotation timer resets once the failover is resolved.

### 9.8 Backup Encryption Model

Dormant backups are encrypted using threshold encryption:

- Decrypting an Active Wallet backup requires both active wallets to co-sign the decryption request.
- Decrypting an Approver backup requires at least 2 of the 3 active approvers to co-sign.

A single compromised node cannot unilaterally decrypt any backup. A contract-level exploit alone is also insufficient — the threshold signatures are required.

---

## 10. Locker Deployment Flow

The locker deployment is a protocol-controlled admin operation. No user can interact with a locker until deployment is fully complete and verified.

```
1. Deploy Locker contract on Monad (VaultFactory authorised caller — deployer wallet only)
2. Calculate slot ranges needed based on locker capacity
3. Run oracle assignment algorithm — assign oracle groups to each slot range
4. Call init_guardian_set on Solana with protocol guardian pubkeys
5. Verify both chains agree the guardian set is active
6. Mark locker as open for rentals
```

**The locker is closed to users until step 6 is confirmed on both chains.**

---

## 11. User Rental Flow

Once a locker is open:

```
1. User pays rent on Monad → slot assigned
2. Backend calls deployVault + move_in on Monad
3. Backend immediately calls register_session on Solana (same flow — no listener needed)
4. NFT key minted to user's Solana wallet
5. User connects wallet → oracle verifies NFT ownership
6. Backend calls sign_proof → returns 65-byte ECDSA signature
7. User submits UserOp to EntryPoint with proof
8. Vault validates proof via OracleVerifier → session active
```

**Access control:** The backend is the only authorised caller on VaultFactory and the Lockers. There is no direct on-chain path for users to bypass the UI.

**move_in_fee:** Users pay a fee when renting a slot. The amount is read dynamically from the Locker contract at rent time.

---

## 12. NFT Key Strategy

### v1 Launch — Metaplex Core Mint

At launch, vault keys are purpose-built NFTs minted through Metaplex Core. The user connects their Solana wallet and mints directly into their own wallet — MonasolProtocol never holds it.

NFT metadata contains:
- The abbreviated vault address (`LCK-4891...203 → VLT-38847...291`)
- The Locker tier (Public, Standard, or VIP)
- The user's chosen security mode (System or Self)
- A unique visual identity generated at mint time

Because the NFT is purpose-built, its structure is exactly what the Active Wallet shards and Approver Ledger mapping expect. This eliminates an entire class of edge cases at launch.

### v2 Roadmap — Shard Tool for Existing NFTs

The shard tool allows any existing Solana NFT to be registered as a vault key without minting anything new. The user selects an NFT they already hold and MonasolProtocol registers its token ID in the Approver Ledger mapping. The NFT gains vault-key functionality without leaving the user's wallet.

This makes every existing Solana NFT holder a potential MonasolProtocol user — Bored Apes, Mad Lads, Tensor Penguins. The shard tool requires a dedicated security audit focused on cross-collection compatibility and composability conflict resolution before launch.

---

## 13. NFT Transfer / Ownership Change

When a vault key NFT is sold or transferred:

```
1. New owner connects wallet — UI detects NFT ownership change
2. Oracle verifies new owner holds NFT on Solana (Metaplex Core RPC)
3. Backend calls transfer_lease on Monad Locker — updates signingWallet
4. New owner requests sign_proof tied to their Monad address
5. New owner has full vault access — no new vault deployment needed
```

The vault on Monad never changes. The NFT IS the key. Whoever holds it on Solana controls the Monad vault.

---

## 14. Two-NFT Model — Principal & Yield

**Audit fix #5 — yield routing isolation.**

Yield generation is architecturally separated from principal custody:

- The **Principal NFT** controls the locked deposit. It never interacts with external DeFi protocols. Holders can unlock the vault principal and nothing else.
- The **Yield NFT** represents the right to receive interest generated by the principal. Yield is generated by routing only the yield stream (not the principal) through an external lending protocol. If that external protocol is exploited, the attacker can steal accrued interest — but the principal remains locked and isolated in the Locker contract.

This preserves the VIP Locker's isolation guarantee while still enabling yield generation as an opt-in feature.

---

## 15. API Endpoints

### Oracle Routes (`/api/oracle`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register-session` | Writes SessionRecord to Solana after Monad move_in |
| POST | `/confirm-settlement` | Drives Pledged → Released on Solana |
| POST | `/finalize-release` | Burns NFT, closes session |
| POST | `/sign-proof` | Signs ECDSA oracle proof for Monad OracleVerifier |
| GET | `/session/:leaseId` | Reads live on-chain session state |

### Vault Routes (`/api/vaults`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/deploy` | deployVault + move_in on Monad |
| POST | `/session/open` | Opens session on Locker slot |
| POST | `/session/close` | Closes session on Locker slot |
| POST | `/lease/transfer` | Transfers slot to new owner |

---

## 16. Revenue Model

Revenue is collected in two ways only: a one-time lifetime lease at vault creation, and a flat fee at each transaction event. No fee references, percentages, or calculations touch the value or contents of any vault.

### Lifetime Lease — Paid Once at Vault Creation

Users pay a one-time upfront lease that secures their vault slot permanently — no expiry, no renewal. Paid in MON at vault creation.

**The lease transfers with the NFT.** When the NFT key is sold, swapped, or transferred, the lifetime lease travels with it. Whoever holds the NFT holds the lease. Buyers on Magic Eden or Tensor are acquiring vault access plus a permanent lease.

Lease pricing scales by Locker tier — the security cost is fixed per Locker regardless of vault count, so the more vaults in a Locker, the cheaper the per-vault lease.

### Per-Transaction Fee — Flat, Collected at the Event

A small flat fee is collected automatically at the contract level for every vault transaction. The fee is identical for every transaction of the same type, regardless of which vault, which Locker tier, or what the vault contains.

Transaction types carrying a fee: Deposit, Withdrawal, Pledged-state transitions, atomic swaps, sub-vault access changes, circuit breaker state changes, light client verification. No variable pricing, no percentage, no reference to transaction size or vault contents.

### Dedicated Institutional Lockers

A private Locker deployed exclusively for a single organization — DAO, investment fund, corporate treasury, or family office. Lease terms and per-transaction fees negotiated upfront. Direct enterprise relationship, not a self-serve flow.

### Two-NFT Yield Stream Fee

When a vault owner opts into the Two-NFT model, MonasolProtocol takes a flat performance fee on the yield generated. Entirely opt-in, entirely separate from the base lease and transaction fees.

---

## 17. Primary Use Cases

### 1. Trustless Cross-Chain OTC Trading & Barter

Alice locks 100,000 USDC on Monad. The protocol mints a Solana NFT into Alice's wallet. Alice moves her vault to Pledged state, then lists the NFT on Magic Eden for 500 SOL. Bob buys the NFT. Bob submits proof of ownership to the Monad oracle. Once confirmed, the vault transitions to Released and Bob holds sole unlock authority over the 100,000 USDC. Because the vault was Pledged before listing, Alice has no ability to drain it during the transfer window.

**Pure barter:** Users can execute trustless direct swaps — e.g. trading a vault containing Monad tokens for a vault containing Wrapped Bitcoin — without either asset leaving its native chain.

### 2. Peer-to-Peer NFT Key Swap

Two vault owners exchange vault access rights via a trustless atomic swap. Both NFTs transfer simultaneously in a single Solana transaction or neither does. Three constraints are hardcoded into the protocol and not configurable:

1. **Atomic only.** No escrow window, no intermediate state.
2. **Flat fee only.** Fixed fee in MON regardless of which NFTs or what vaults contain.
3. **No vault contents displayed.** Swap UI shows NFT identifiers and wallet addresses only. NexusBridge has no visibility into vault contents and does not expose them.

**Regulatory position:** MonasolProtocol is infrastructure, not an exchange operator. It is never a counterparty. Price discovery and negotiation happen entirely off-platform.

### 3. Cross-Chain Institutional Custody & Settlement

An institution locks assets in a dedicated VIP Locker. The institution holds the NFT in their own Solana multisig (e.g. Squads). When capital needs to change hands — between funds, entities, or jurisdictions — the NFT is transferred via standard Solana infrastructure. The EVM assets never move; only the access credential does. This model is appropriate for regulated entities operating under standard AML/KYC frameworks.

### 4. Trustless Inheritance & Estate Planning

A principal locks their crypto estate in a Monad vault and places the Solana NFT into a time-locked or dead-man's-switch contract on Solana. If the principal fails to check in within a configured window (e.g. 6 months), the Solana contract automatically transfers the NFT to the heir's wallet. The heir then gains full control of the estate. No lawyer, no court, no trusted executor.

### 5. Liquid Vesting

A protocol deposits unvested tokens into Lockers and airdrops Solana NFTs to investors — each investor holds their own NFT in self-custody from receipt. Even though the EVM tokens are hard-locked, an investor needing immediate liquidity can move the vault to Pledged state and sell the NFT at a discount. The buyer acquires the right to the tokens when the time-lock expires, creating a compliant secondary market for vesting allocations.

### 6. DeFi Composability — Cross-Chain Collateral

The Solana NFT mathematically represents the locked EVM value. The user moves the vault to Pledged state and deposits the NFT into a Solana NFT-Fi lending protocol (e.g. SharkyFi). They borrow USDC natively on Solana. The Monad assets remain locked — they cannot be touched while the NFT is pledged.

### 7. Event Ticketing

A promoter deploys a dedicated Locker for their event containing one vault per ticket tier. Three compounding layers eliminate scalping:

**Layer 1 — Token notation:** Every ticket is a unique numbered NFT encoding seat range, admission count, and discount — all derived from how many tickets the buyer selects. `#021*025-10` = seats 21 through 25, 5 admissions, $10 group discount. The discount is locked into NFT metadata at mint time and cannot be changed.

**Layer 2 — AI wallet screening:** Fans register their Solana wallet up to 2 weeks before sale day. Screening analyzes wallet age, transaction depth, connected wallet clustering, prior event behaviour, and NFT holding history. Results: Confirmed (guaranteed window), Waitlist (15-minute delay), Flagged (locked out entirely).

**Layer 3 — Soul-bound identity verification:** Buyers must hold a Soul-Bound Identity Token (non-transferable, permanently tied to their wallet, integrated with Civic Pass). KYC levels are promoter-configurable per vault: None, Soft, Standard, or Hard. After the initial transfer lock period expires, tickets can only transfer to a wallet holding a soul-bound token at the same or higher verification level.

**Venue access:** Dual-token door check verifies NFT ownership and soul-bound identity simultaneously. One scan. No paper. No QR screenshot. The NFT in the holder's wallet is the ticket — and only the holder's private key can sign the door challenge.

### 8. Generational Trust & Yield Rights

A user locks wealth in a Monad vault and places the Solana NFT into a Time-Capsule contract with a specific unlock date (e.g. 2076). A cryptographic claim ticket can be held physically or digitally. Whoever possesses the claim ticket when the date arrives can withdraw the NFT and unlock the vault.

**Yield rights separation:** While the principal is locked, the vault owner can issue a separate Yield NFT granting a lessee the right to receive generated yield in exchange for periodic rent. The principal NFT — and sole control of the underlying deposit — remains with the original owner or their designated heir.

---

## 18. Audit History

### v1.0 → v2.0 Changes

| v1.0 Claim / Feature | v2.0 Replacement | Reason |
|---|---|---|
| Trusted oracle | Solana Light Client + Merkle proofs (Phase 2) | Oracle = centralized trust assumption |
| AI Sentinel platform-wide freeze | User-Owned Circuit Breakers (opt-in, self-custodied) | Platform freeze = admin key, coercible |
| "Zero-Trust" with admin freeze capability | Genuinely no platform admin key | Contradiction in original model |
| "Zero-Knowledge Privacy" | "On-Chain Opacity" | ZK is a specific cryptographic primitive; the claim was false |
| "Borderless capital flight" | "Cross-Chain Institutional Custody & Settlement" | Regulatory landmine |
| Yield deployed from principal | Two-NFT Model | Yield routing broke VIP isolation guarantee |
| No transfer race condition protection | Pledged state machine | Front-running attack vector |

### v2.0 → v3.0 Changes

| v2.0 Feature | v3.0 Addition | Reason |
|---|---|---|
| 5-of-5 consensus with no fault tolerance | Active Wallet backups + Approver pool | Zero fault tolerance = permanent lockout risk |
| No node health monitoring | Automated health score (uptime + signature rate, rolling 24h) | Silent node degradation undetectable |
| No retirement process | Threshold-triggered retirement with data migration + cryptographic wipe | Graceful replacement without interruption |
| No rotation schedule | Mandatory 120h hard rotation for all active nodes | Long-lived nodes accumulate attack surface |
| No collision handling | Contract collision guard | Race condition between concurrent contract actions |
| Backup encryption unspecified | Threshold encryption — quorum co-signature required | Single compromise must not unlock entire backup |
| Backup pool management unspecified | Hard pool floor of 2 approver backups | Unmanaged pool depletion leaves no recovery path |

### v3.0 → v4.0 Changes

| v3.0 Model | v4.0 Clarification | Reason |
|---|---|---|
| NFT key strategy unspecified | Launch with Metaplex Core mint; shard tool roadmapped post-launch | Eliminates composability edge cases at launch |
| Custody model ambiguous | MonasolProtocol never holds the NFT or any complete key — only shards and mapping data | Custody of NFT determines regulatory classification |
| Key derivation implied protocol involvement | User's NFT + user's Solana wallet signature = the only complete unlock credential | Shards verify, mapping points, only the user's wallet unlocks |
| Circuit breaker described as protocol-wide | System mode locks only the affected Locker, not all System-mode vaults globally | Containment boundary is the Locker, not the protocol |
| Vault addresses shown as short integers | Production addresses are large integers, abbreviated in UI: `LCK-4891...203 → VLT-38847...291` | Matches wallet address convention |

---

## 19. Pending Architecture Work

| Item | Priority | Notes |
|------|----------|-------|
| Oracle registry schema | High | Tracks oracle pubkeys, load, max assignments, roles |
| Slot range assignment engine | High | Mathematical assignment of oracle groups to slot ranges |
| `init_guardian_set` wired into locker deploy flow | High | Currently manual |
| `register_session` wired into vault deploy flow | High | Currently separate call |
| Node health score publishing on-chain | High | Required for automated failover |
| Backup node provisioning and encryption pipeline | High | Required before mainnet |
| HSM integration | Pre-mainnet | AWS CloudHSM / Azure Dedicated HSM / Hashicorp Vault |
| Multi-oracle `sign_proof` (threshold=3) | Pre-mainnet | Current implementation signs with single deployer key |
| 120-hour rotation contract logic | Pre-mainnet | Timer + collision guard |
| Soul-bound identity token integration (Civic Pass) | Pre-mainnet | Required for ticketing use case |
| Atomic swap contract (P2P NFT key swap) | Post-launch | Solana program, flat-fee, atomic only |
| Time-Capsule contract | Post-launch | Generational trust use case |
| Shard tool for existing NFTs | v2 | Requires dedicated security audit |
| Solana Light Client on Monad (Vyper) | Phase 2 | Replaces oracle network; requires independent formal security audit |
