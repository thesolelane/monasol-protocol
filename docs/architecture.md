# MonasolProtocol — Architectural Design Document
**Cooperanth Consulting LLC**
**Date: May 2026**

---

## 1. Overview

MonasolProtocol is a cross-chain vault custody system where EVM assets on Monad are controlled by Solana NFT keys. Ownership of a Metaplex Core NFT on Solana is the sole credential that authorises access to a corresponding smart account vault on Monad.

The system operates across three layers:

| Layer | Chain | Role |
|-------|-------|------|
| NFT Key | Solana | Proof of ownership — the credential |
| Oracle Network | Off-chain | Bridge — reads Solana, writes to both chains |
| Vault | Monad (EVM) | Asset custody — ERC-4337 smart account |

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

---

## 3. Live On-Chain Proofs

All transactions below are confirmed and verifiable.

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

## 4. Session Lifecycle

```
ACTIVE → PLEDGED → SETTLING → RELEASED → CLOSED
```

| State | Trigger | Actor |
|-------|---------|-------|
| Active | `register_session` called by oracle | Oracle |
| Pledged | Guardian set approved, shards submitted | Guardian set |
| Settling | Monad settlement event confirmed | Oracle |
| Released | `confirm_settlement` called | Oracle |
| Closed | `finalize_release` called, NFT burned | Operator |

---

## 5. Oracle Network Architecture

### 5.1 Threshold Oracle Model

The protocol uses a **threshold oracle network** — no single oracle can act alone.

- N total oracles, all whitelisted on both chains
- Minimum quorum of 3 oracle signatures required per message
- Different combinations of 3 oracles serve different roles within the same locker

### 5.2 Compartmentalised Oracle Routing

Within each slot range, oracle groups are partitioned by guardian role:

```
Shard Holder A  ←  oracle group {a, b, c}        (3 oracles)
Shard Holder B  ←  oracle group {a, b, d}        (2 shared + 1 different)
Verifier        ←  oracle group {a, e, f}        (1 shared + 2 different)
```

**Security property:** To compromise a full session, an attacker must simultaneously control oracles from all three groups. Since the groups overlap but are never identical, the attacker's required set is always larger than any single group.

**Shard holder isolation:** Shard holders never communicate outside the group of 5 guardians. They are receive-only from their designated oracle group. No external messages reach them.

### 5.3 Oracle Scaling by Slot Range

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

### 5.4 Oracle Whitelist — Both Chains

Oracles are whitelisted on both chains simultaneously:

| Chain | Contract | Mechanism |
|-------|---------|-----------|
| Monad | OracleVerifier | `approvedSigners` mapping, threshold=3 |
| Solana | oracle_verifier PDA | Approved oracle pubkeys |

**Retiring an oracle requires admin action on both chains.** Neither chain accepts a retired oracle's signatures unilaterally. This is by design — the system is deliberately stubborn about signer changes.

---

## 6. Guardian Set Architecture

### 6.1 Fixed 5-Guardian Protocol Set

The guardian set is **protocol-level** — fixed at 5 members regardless of locker size or slot count.

```
[0] Shard Holder A   — holds key fragment A for all assigned sessions
[1] Shard Holder B   — holds key fragment B for all assigned sessions
[2] Approver 0       — votes to approve settlement
[3] Approver 1       — votes to approve settlement
[4] Approver 2       — votes to approve settlement
```

Guardians do not scale with locker size. A single guardian can hold shard commitments for thousands of active sessions simultaneously.

### 6.2 Guardian Scaling vs Oracle Scaling

| Component | Scales with locker size? | Why |
|-----------|------------------------|-----|
| Oracles | Yes — more slot ranges need more oracle groups | Load distribution |
| Guardians | No — fixed 5 protocol wallets | Accumulate sessions |
| HSM keypairs | Fixed — 5 total (2 shard + 3 approver) | One set for all sessions |

Adding guardians is a **protocol upgrade decision** (e.g. moving from 3-of-5 to 4-of-7 threshold), not a scaling decision.

### 6.3 Guardian Keypair Security

Guardian private keys are generated once at protocol genesis and stored in an off-chain HSM. Private keys never exist in server memory. The API server only ever receives and registers pubkeys.

**HSM boundary:** Guardian keypairs are generated inside the HSM. Pubkeys are registered on-chain via `init_guardian_set`. Private keys never leave the HSM.

---

## 7. Locker Deployment Flow

The locker deployment is a protocol-controlled admin operation. No user can interact with a locker until deployment is fully complete and verified.

```
1. Deploy Locker contract on Monad (VaultFactory authorised caller)
2. Calculate slot ranges needed based on locker capacity
3. Run oracle assignment algorithm — assign oracle groups to each slot range
4. Call init_guardian_set on Solana with protocol guardian pubkeys
5. Verify both chains agree the guardian set is active
6. Mark locker as open for rentals
```

**The locker is closed to users until step 6 is confirmed on both chains.**

---

## 8. User Rental Flow (Post-Deployment)

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

---

## 9. NFT Transfer / Ownership Change

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

## 10. Oracle Proof Format

The oracle proof submitted to `OracleVerifier.verifyAccess()`:

```
digest  = keccak256(abi.encodePacked(nftMint_bytes32, owner, expiry, chainId))
proof   = signature_1 || signature_2 || signature_3   (195 bytes, threshold=3)
```

Each signature is a standard 65-byte ECDSA signature (secp256k1) over `eth_sign(digest)`.

The nftMint is encoded as the raw 32 bytes of the Solana public key — not a string encoding.

---

## 11. API Endpoints

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

## 12. Pending Architecture Work

| Item | Priority | Notes |
|------|----------|-------|
| Oracle registry schema | High | Tracks oracle pubkeys, load, max assignments, roles |
| Slot range assignment engine | High | Mathematical assignment of oracle groups to slot ranges |
| `init_guardian_set` wired into locker deploy flow | High | Currently manual |
| `register_session` wired into vault deploy flow | High | Currently separate call |
| HSM integration | Pre-mainnet | AWS CloudHSM / Azure / Hashicorp Vault |
| Multi-oracle `sign_proof` (threshold=3) | Pre-mainnet | Current implementation signs with single deployer key |
| ZKVerifier (Phase 2) | Future | Replaces OracleVerifier once Solana light client is ready |
