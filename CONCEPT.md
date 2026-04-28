# MonaSol Protocol
## Cross-Chain Vault Architecture & Business Model

**Semi-Final Draft — April 2026**
Cooperanth Consulting LLC
acooper@cooperanth.com | (978) 320-1714

*This document contains proprietary and confidential information belonging to Cooperanth Consulting LLC. Distribution or reproduction without written permission is prohibited.*

---

## Chapter Contents

- **Chapter 1 — Protocol Architecture** — Neighborhood model, 8 security layers, tech stack, 8 use cases
- **Chapter 2 — Business Model & Token** — Revenue, MSL token, halving model, ecosystem, roadmap, real challenges
- **Chapter 3 — Community Lockers** — Co-op model, collective TVL, individual custody, lock products, treasury bootstrapping
- **Chapter 4 — Cross-Chain Liquidity Management** — Active trader vault, idle yield, aggregated swaps, friction analysis

---

## Chapter 1 — Protocol Architecture

### What MonaSol Is

MonaSol Protocol is a cross-chain vault custody system where assets are locked on Monad (EVM) and controlled exclusively via NFT keys on Solana. The user holds the NFT in their own Solana wallet at all times. MonaSol never holds the NFT, never holds a complete key, and has no custody of any unlock credential.

The core insight: **MonaSol does not move money. It moves the deed to the vault.** The NFT in the user's wallet plus a valid signature from that wallet are the only combination that opens a vault.

---

### The Neighborhood Model

MonaSol uses a consistent analogy throughout all documentation, code, and user-facing language:

| Analogy | Technical Term / Definition |
|---|---|
| Neighborhood | Protocol — The entire MonaSol system |
| Building | Locker — An isolated smart contract at its own on-chain address |
| Apartment | Vault — A user's asset container inside a Locker |
| Room | Sub-vault — A partitioned section inside a Vault with delegated access |

Sub-vault is the technical term. Room is the user-facing name for the same concept.

---

### Architecture — Eight Layers

#### 1. Compartmentalized Risk
MonaSol deploys isolated Locker smart contracts — one per building in the neighborhood. Public Lockers hold up to 20,000 vaults. VIP Lockers hold as few as 10. Dedicated Lockers serve single institutions. No shared state between Lockers. A breach in one Locker has zero impact on any other.

#### 2. Individual Vault Encryption
Every vault is independently secured by a cryptographic commitment tied to the corresponding Solana NFT. Compromising one vault reveals nothing about any other. Vault commitments use SHA-256 or SHA-512.

#### 3. Sub-Vault Gating — The Rooms Model
Inside a single vault, the owner can create distinct Sub-vaults (Rooms), enabling granular delegated access without exposing the full principal. A CFO can be given access to Room A (payroll) while Room B (treasury reserve) remains mathematically inaccessible to their key.

#### 4. Trustless Cross-Chain Verification — Solana Light Client on Monad
MonaSol deploys a Solana Light Client directly on Monad. To unlock a vault, a user submits a Merkle proof of NFT ownership. The Monad contract verifies this cryptographically against the light client's known Solana state — no intermediary, no trusted third party, no admin key. This is novel infrastructure. Nobody has shipped a production Solana light client on an EVM chain. It is the longest item on the critical path.

#### 5. On-Chain Opacity
Vault contents are not visible on the EVM side. An observer can see that a vault exists but cannot determine what is inside it without the owner's cryptographic Access Key. This is on-chain opacity — not zero-knowledge privacy. Pseudonymity is provided, not anonymity.

#### 6. User-Owned Circuit Breakers
No platform-wide admin freeze. Every vault owner chooses **System Mode** (vault locks with other System-mode vaults in the same Locker when a threat is confirmed — pre-authorized collective protection) or **Self Mode** (user receives an alarm with Lock/Deny options; non-response triggers read-only degraded state). MonaSol can never unilaterally lock a Self-mode vault.

#### 7. The Pledged State
Vault state machine: Active → Pledged → Settling → Released. To list an NFT for sale or use it as collateral, the vault must first enter Pledged state. This closes the front-running window — the seller cannot drain the vault while the transfer is in progress.

#### 8. Node Health, Failover & Mandatory Rotation
2 Active Wallets (95% health threshold, 1 dedicated backup each) + 3 Approvers (90% threshold, shared pool of 2 backups). All backups dormant and encrypted until activated. Health score = (uptime + signature success) / 2, sampled every 10 minutes. Mandatory 120-hour rotation for all active nodes regardless of health. Collision guard prevents simultaneous rotation and failover on the same node.

---

### Blast Radius Containment

| Breach Level | Who Is Affected | Who Is Notified |
|---|---|---|
| Sub-vault | That sub-vault only | Vault owner — full alarm |
| Vault | That vault only | Vault owner — full alarm; same Locker owners — building watch |
| Locker | All vaults in that Locker | All Locker owners — full alarm; all other Lockers — neighborhood watch |

---

### Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Solana access layer | Rust & Anchor | NFT minting, state transitions, swap execution, circuit breakers |
| Monad storage layer | Vyper | Vault contracts, Locker factory, deterministic gas, formally verifiable |
| Cross-chain verification | Solana Light Client (Vyper on Monad) | Trustless NFT ownership proof — no oracle |
| Yield separation | Two-NFT model | Principal NFT (vault) + Yield NFT (interest stream) — isolated risk |
| NFT standard | Metaplex Core | ~0.0029 SOL per mint, single-account design, 80% cheaper than legacy |

---

### Use Cases

#### 1. Trustless Cross-Chain OTC Trading & Barter
Lock assets on Monad, mint Solana NFT key, pledge vault, list on Magic Eden. Buyer submits Merkle proof, vault transitions to Released. Atomic settlement — no bridge, no oracle.

#### 2. Peer-to-Peer NFT Key Swap
Atomic swap — both NFTs transfer simultaneously or neither does. Flat fee. No vault contents displayed. No escrow. MonaSol is never a counterparty.

#### 3. Cross-Chain Institutional Custody
Institution locks assets in Dedicated Locker, holds NFT in Squads multisig. Capital changes hands by transferring the NFT — EVM assets never move.

#### 4. Trustless Inheritance & Estate Planning
NFT placed in dead-man's-switch contract. Automatic transfer to heir on non-check-in. No lawyer, no court, no trusted executor.

#### 5. Liquid Vesting
Unvested tokens locked in Lockers, NFTs airdropped to investors. Investors can sell the NFT (and future token rights) on secondary market without waiting for cliff.

#### 6. DeFi Composability — Cross-Chain Collateral
Pledge vault, deposit NFT into SharkyFi. Borrow on Solana against Monad-locked collateral. No bridging, no slippage.

#### 7. Event Ticketing — AI Screened & Identity Locked
Promoter deploys event Locker with one vault per tier. Tickets are numbered NFTs: #021*025-10 = seats 21–25, 5 admissions, $10 discount. Three anti-scalping layers: AI wallet screening, soul-bound KYC (Civic Pass), dual-token door check at venue.

#### 8. Generational Trust & Yield Rights
Time-Capsule contract with unlock date. Cryptographic claim ticket — whoever holds it when the date arrives claims the NFT and vault. Separate Yield NFT can be leased to a third party while the principal remains locked.

---

## Chapter 2 — Business Model, Token & Roadmap

### Revenue Model

MonaSol earns revenue two ways only: a one-time lifetime lease at vault creation, and a flat fee at each transaction event. No fee references, percentages, or calculations touch the value or contents of any vault.

#### Lifetime Lease — Paid Once

| Locker Tier | Vault Capacity | Lease (SOL) | USD @ $86 |
|---|---|---|---|
| Public | Up to 20,000 | 0.05 SOL | ~$4.30 |
| Standard | Up to 1,000 | 0.15 SOL | ~$12.90 |
| VIP | 10–100 vaults | 0.50 SOL | ~$43.00 |
| Dedicated | Custom | Negotiated | — |

The lease transfers with the NFT. When the NFT key is sold, the new owner inherits the permanent vault rights — no re-registration, no additional payment.

#### Per-Transaction Fee — Flat

| Transaction | SOL | USD @ $86 |
|---|---|---|
| Move-in | 0.001 SOL | ~$0.09 |
| Deposit | 0.001 SOL | ~$0.09 |
| Withdrawal | 0.001 SOL | ~$0.09 |
| Swap | 0.002 SOL | ~$0.17 |
| Transfer | 0.001 SOL | ~$0.09 |
| Pledge/unpledge | 0.001 SOL | ~$0.09 |

#### Revenue at 50,000 Vaults — SOL Only (First 24 Months)

| Tier | Vaults | SOL Collected | USD @ $86 |
|---|---|---|---|
| Public (70%) | 35,000 | 1,750 SOL | $150,500 |
| Standard (20%) | 10,000 | 1,500 SOL | $129,000 |
| VIP (8%) | 4,000 | 2,000 SOL | $172,000 |
| Dedicated (2%) | 1,000 | 2,000 SOL | $172,000 |
| Move-in fees | 50,000 | 50 SOL | $4,300 |
| **TOTAL** | **50,000** | **7,300 SOL** | **$627,800** |

Lease and move-in revenue only — before a single deposit, withdrawal, swap, transfer, or event ticket is counted.

---

### MSL Token

MSL is the native utility token of MonaSol Protocol with three functions: fee payment (from month 24), vault creation reward (locked 36 months from move-in date), and future staking for neighborhood watch participation. MSL is not a security, does not represent profit-sharing, and does not entitle holders to protocol revenue.

**Total Supply: 2,000,000,000 MSL — Fixed Forever**

| Bucket | % | MSL | Purpose |
|---|---|---|---|
| Vault creation pool | 50% | 1,000,000,000 | Distributed via vault creation, 36-month lock |
| Protocol treasury | 20% | 400,000,000 | Development, operations, audits |
| Ecosystem & grants | 15% | 300,000,000 | Builders on top of MonaSol |
| Liquidity | 10% | 200,000,000 | DEX liquidity — Orca, Raydium |
| Team | 5% | 100,000,000 | 3-year vest, 1-year cliff |

#### Vault Creation Reward — The Thirds Model

Every vault created receives MSL locked for exactly 36 months from that vault's creation date. The amount drops by one third each tier. Early adopters receive disproportionately more.

| Tier | Vault Range | MSL/vault | Vaults | MSL Distributed | Cumulative |
|---|---|---|---|---|---|
| 1 | 1 – 500 | 36,000 | 500 | 18,000,000 | 18,000,000 |
| 2 | 501 – 1,500 | 24,000 | 1,000 | 24,000,000 | 42,000,000 |
| 3 | 1,501 – 3,500 | 16,000 | 2,000 | 32,000,000 | 74,000,000 |
| 4 | 3,501 – 7,500 | 10,667 | 4,000 | 42,668,000 | 116,668,000 |
| 5 | 7,501 – 15,500 | 7,111 | 8,000 | 56,888,000 | 173,556,000 |
| 6 | 15,501 – 31,500 | 4,741 | 16,000 | 75,856,000 | 249,412,000 |
| 7 | 31,501 – 63,500 | 3,160 | 32,000 | 101,120,000 | 350,532,000 |
| 8 | 63,501 – 127,500 | 2,107 | 64,000 | 134,848,000 | 485,380,000 |
| 9 | 127,501 – 255,500 | 1,404 | 128,000 | 179,712,000 | 665,092,000 |
| 10 | 255,501 – 511,500 | 936 | 256,000 | 239,616,000 | 904,708,000 |
| 11 | 511,501 – 767,500 | 624 | 256,000 | 95,292,000 | 1,000,000,000 |

Vault pool exhausts at approximately 767,500 vaults. After that vaults are created normally but receive no MSL allocation. Vault #001 receives 36,000 MSL. Vault #50,000 receives ~4,741 MSL. A **7.6x early adopter advantage** permanently encoded in the protocol.

#### Payment Timeline

| When | Event |
|---|---|
| Day 1 | SOL payments only. NFT minting from Solana side only. |
| 50,000 vault milestone | Cross-chain minting unlocks — users can move in from either Solana or Monad side. |
| Month 24 | MSL payment activates for all services. 20% discount for MSL payers. SOL still accepted. |
| Month 36 (rolling) | First vaults hit 36-month mark. MSL unlocks on a rolling daily schedule — no cliff, no flood. |
| Month 36–54 | Rolling unlocks complete across all early vaults. Pace mirrors original vault creation rate. |

---

### MSL Ecosystem

#### Staking — Weekly HODL Rewards
Users stake unlocked MSL post month 36. Weekly rewards from ecosystem bucket. Multipliers: flexible 1x, 3 months 1.5x, 6 months 2x, 12 months 3x, 24 months 5x. Staked MSL backs the neighborhood watch security layer — good behavior earns fees, malicious behavior is slashed.

#### MonaSol AI
AI inference layer where queries are paid in MSL. Native protocol context — vault history, tier, MSL balance. Use cases: vault configuration advice, plain-English smart contract summaries, event planning, neighborhood explorer queries. Every query burns MSL.

#### MonaSol Events
Protocol-run community events. Entry requires minimum MSL balance or staking position. Tickets are MSL-gated NFTs — MSL burned to claim (deflationary). Annual events: Founders Summit (vaults 1–500 only), Neighborhood Block Party (all active vault holders), Dedicated Locker dinner.

#### Merchandise
MSL-gated physical product drops. MSL burned per purchase — deflationary. Founder edition physical key ships free to vault #001–#500 holders. Limited runs tied to protocol milestones.

#### Designer NFT Collections
Collaborations with named artists — not AI generated. Limited collections purchasable exclusively in MSL. Holding one grants a permanent protocol benefit. Right artist collaboration crosses the crypto-art boundary into broader culture.

#### Partnerships
MSL as payment layer for partner protocols. Priority: Magic Eden, Tensor, Monad DeFi protocols, hardware wallet manufacturers, legal and estate planning firms, event promoters.

#### Gaming — Virtual Neighborhood
Long-runway play. Virtual MonaSol neighborhood — buildings (Lockers), apartments (Vaults), rooms (Sub-vaults). MSL is in-game currency. Real vault assets have virtual representations. FiveM-style modular architecture — MonaSol provides the base world, community builds content.

---

### How the Protocol Learns

Every promoter who deploys an event Locker teaches MonaSol what sells. Every artist who mints through the protocol teaches MonaSol what collectors value. Every institutional Dedicated Locker client teaches MonaSol what enterprise treasury managers actually need. Every gamer in the virtual neighborhood teaches MonaSol what the in-game economy requires.

This accumulated protocol intelligence — built from real usage — is the strongest moat MonaSol can build. By year 3, MonaSol knows things about cross-chain asset custody behavior that no research firm, no VC, and no competing protocol knows. The roadmap is a hypothesis. The community corrects it.

---

### The Real Challenges

**1. The Solana Light Client Doesn't Exist Yet**
Nobody has shipped a production Solana light client running natively on an EVM chain. 6–12 months of specialist engineering minimum. Formal specification and independent security audit required before mainnet. Everything on the Monad side depends on it.

**2. The Required Team Is Expensive and Rare**
Vyper developers are rare. Anchor/Rust engineers who understand cross-chain verification are rarer. The gap between a working testnet and mainnet is 3–5 senior engineers at $150K–$300K per year each. The frontend is built. The engineering team is not.

**3. Regulatory Exposure Is Real**
The architecture is careful — on-chain opacity not zero-knowledge, flat fees not asset-based pricing, infrastructure not exchange operator. But soul-bound KYC for ticketing, verified transfer receipts, and institutional custody touch regulated territory across jurisdictions. Crypto-specialist legal review is required before taking institutional money.

**4. 5-Party Consensus Is Operationally Complex**
Active Wallets, Approver Ledgers, backup pools, 120-hour rotation, and health monitoring are live 24/7 infrastructure — not a smart contract you deploy and forget. DevOps infrastructure and on-call engineering are required from day one of mainnet.

**5. 50,000 Vaults Is Not Guaranteed**
50,000 vaults requires 50,000 real users making a deliberate decision to pay $5–$50 for a lifetime lease on a new protocol. Comparable protocols took 18–36 months. Some never reached it.

**6. MSL Creates Regulatory Exposure**
A token that unlocks after 36 months and trades on DEXs walks a fine line with the SEC's Howey test. A legal opinion on MSL structure is required before public distribution. Launching outside the US first is the common approach.

---

### The Funding Path

| Stage | Source | Amount | Unlocks |
|---|---|---|---|
| Now | Solana Foundation grant | $50K–$100K | First Anchor engineer |
| Now | Monad ecosystem grant | $10K–$50K | First Vyper contract |
| Month 1–3 | Hackathon prizes | $5K–$50K | Demo + team |
| Month 3–6 | Superteam bounties | $1K–$10K | Community + visibility |
| Month 6–12 | Pre-seed round | $500K–$2M | Full team, legal, light client |
| Month 12–24 | Seed round | $2M–$5M | Mainnet, security audit, operations |

---

### Phased Roadmap

| Phase | Month | Milestone | Funded by |
|---|---|---|---|
| 0 | Now | GitHub, Twitter, grant applications | Free |
| 1 | 1–3 | Monad testnet — basic Vyper Locker contract | Grant |
| 1 | 1–3 | Solana devnet — Anchor NFT minting program | Grant |
| 2 | 3–6 | Testnet demo — end-to-end move-in working | Grant |
| 2 | 3–6 | Pre-seed fundraising begins | Demo |
| 3 | 6–12 | Solana light client — formal specification | Pre-seed |
| 3 | 6–12 | Legal review — architecture and MSL token | Pre-seed |
| 4 | 12–18 | Light client — build and internal audit | Pre-seed |
| 4 | 12–18 | Security audit commissioned | Pre-seed |
| 5 | 18–24 | Mainnet launch — first public Lockers | Seed |
| 5 | 18–24 | 50,000 vault milestone → cross-chain minting unlocks | Organic |
| 6 | 24 | MSL payment activates. Staking protocol launches. | Seed |
| 7 | 24–30 | Designer NFT collection. MonaSol AI beta. | Seed |
| 8 | 36 | First MSL unlocks rolling. Merch store opens. | Organic |
| 9 | 36–48 | Partnerships live | Organic |
| 10 | 48–60 | Gaming protocol alpha | Series A |
| 11 | 60 | Virtual neighborhood beta | Series A |

---

## Chapter 3 — Community Lockers

### The Co-op Model

A MonaSol Community Locker is a building where every member holds their own apartment but the building itself has collective identity, collective TVL, and collective governance over building-level decisions. Individual members keep full self-custody of their vault — nobody can touch another member's assets. The coordination happens at the locker level. The custody stays individual.

This is the difference between a rental building and a co-op. Every member owns their unit. They vote together on building decisions. The building's value reflects the sum of everything inside it, and that value is visible, verifiable, and on-chain.

### What a Community Locker Enables

**Collective TVL as Proof of Commitment**
The locker TVL is a live on-chain number reflecting real locked value — not circulating supply, not market cap, not a number posted in a Discord. A DAO that places all its contributors in one locker produces a TVL figure the entire market can verify without trusting anyone. That number is the community's credibility signal.

**Community Sub-Vault — The Shared Room**
Slot 0 of every Community Locker is reserved as the community pool — a shared sub-vault that no single member controls. Contributions flow in from individual vaults. Governance controls what the pool funds: grants, contributor payments, the next initiative, or a coordinated swap into a target asset. Every movement from the community pool requires a governance threshold — a minimum percentage of slot holders signing off.

**Governance Weight by Lock Size**
Each member's governance weight is proportional to the value locked in their individual vault. Members who commit more carry more weight on locker-level decisions. This is encoded in the contract — not administered by a team, not subject to a social vote, not adjustable after deployment. The lock amount at move-in determines the weight. It cannot be gamed after the fact.

**MSL Distribution by Lock Size**
Community Locker members earn MSL rewards on the same halving schedule as individual vault holders, with one addition: members who lock more than the community average earn a multiplier on their MSL allocation. Early members of a high-TVL community locker receive disproportionately more MSL — the same early-adopter advantage that applies to vault creation tiers applies to community participation depth.

---

### Community Treasury Bootstrapping

The most immediate community locker product requires no additional infrastructure. A project deploys a Community Locker. Members each move into a vault and lock a contribution — any EVM asset. The locker TVL is the project treasury, visible on-chain. No presale. No VC. No multisig that one person controls. The vault is the escrow, the NFT key is the membership receipt, and the locker TVL is the proof of collective commitment.

**Example:** 100 community members each lock 0.25 BNB. At current prices that is approximately $15,700 pooled. The community sub-vault executes a single aggregated swap into SOL, which lands in the project treasury wallet at the unlock date. Every member holds a vault NFT proving their contribution. That NFT is their receipt, their governance weight, and their claim on whatever the treasury does next.

---

### Lock Products

**Supply Lock with Scheduled Multi-Wallet Distribution**
A team locks tokens inside a Community Locker vault. At unlock, the funds sub-vault distributes automatically to up to 100 predetermined wallet addresses — each receiving their exact allocation by percentage. No manual intervention. Email notifications fire to all registered addresses when the unlock executes. The distribution map is set immutably at vault creation. No member of the team can adjust recipient addresses or amounts after deployment.

**LP Lock**
A memecoin team locks liquidity pool tokens inside a vault instead of burning them. LP stays provably inaccessible until the unlock date. The community verifies the NFT key exists and has not moved. LP lock preserves optionality — the team can recover liquidity after the lock period expires — while providing the same trust signal as a burn during the lock period. For projects that want eventual liquidity control, lock is strictly better than burn.

**Burn on Date**
A team sets a burn date at vault creation. On that date the contract sends tokens to the dead address automatically. No human triggers it. Immutable once set. The team literally cannot change their mind after deployment. This is a credibility product — the on-chain timestamp and the NFT key are the proof, not a promise on social media.

**Cross-Chain Wrapped Token Lock**
A team launches on Solana. They wrap an EVM asset — BNB, ETH, MATIC — and lock the wrapped version in a MonaSol vault on Monad. No trading on the wrapped asset until the Solana token stabilizes or a predetermined condition is met. The Solana community sees the EVM supply is frozen via the NFT key. The cross-chain lock is the stabilization mechanism — it prevents the wrapped asset from being dumped while the native token finds its price floor.

**Community Governance Lock**
Community members vote to lock LP or supply. Lock parameters — duration, unlock conditions, distribution on unlock — are set by governance before the lock executes. The NFT key is held by a community Squads multisig on Solana, not the founding team. No single person holds the key. The rug vector is removed at the contract level, not by social trust.

---

### Verified Project Badge

Any project that deploys a Community Locker and meets a minimum TVL threshold receives a verified lock badge visible in the MonaSol locker directory. The badge is not purchased. It is earned by locking real value in a verifiable way. For a memecoin community the badge is the trust signal the space needs — provable, on-chain, not dependent on the team's reputation.

---

### Solana Native Locks — Phase 2

Community Lockers in Phase 1 target EVM-native communities: Monad projects, BNB chain projects, ETH projects wrapping assets into Monad. Solana-native communities — those holding SOL and SPL tokens directly — require a native Anchor lock program on Solana. That program is a separate engineering workstream, planned for Phase 3 of the roadmap alongside the Solana light client build. The NFT key model, multisig verification, and proof-of-lock mechanics are identical across both chains. Only the asset custody layer changes.

---

## Chapter 4 — Cross-Chain Liquidity Management

### The Active Trader Problem

A Solana trader sitting on BNB, MATIC, ETH, or any EVM asset who wants SOL has two options today: a centralized exchange with withdrawal delays and KYC requirements, or a bridge with slippage, trust assumptions, and UI friction. Both options are slow relative to the speed of a trade opportunity. That friction has cost real money on missed positions.

MonaSol solves this natively. The vault already holds EVM assets on Monad. The NFT key already lives on Solana. The infrastructure for cross-chain control is already built. A swap from vault-held BNB to SOL landing in the user's Solana wallet is a sub-vault action — not a bridge, not a CEX withdrawal, not a new account to create.

---

### The Vault as Personal Liquidity Hub

A vault configured for active trading is not storage — it is a personal cross-chain treasury. Each sub-vault is assigned a purpose at move-in: funds, swaps, yield, payments, or ledger. The funds sub-vault holds idle assets. The swap sub-vault executes cross-chain conversions on demand. The yield sub-vault points at a DeFi strategy on Monad that compounds idle assets while the user is not actively trading.

When a trade opportunity appears on Solana, the user initiates a swap from the vault. EVM asset exits the vault, SOL lands in their Solana wallet. No CEX login. No bridge UI. No waiting for withdrawal confirmation. The NFT key session authorizes the action; the swap sub-vault executes it; the transaction is complete in seconds.

---

### Idle Asset Yield

Assets sitting in a funds sub-vault between trades are not idle. The sub-vault is connected to a yield strategy on Monad — a lending pool, a liquidity position, or a structured yield product. The user does not manage this manually. The sub-vault purpose is set at move-in and executes automatically. When the user needs liquidity for a swap, the sub-vault unwinds the yield position, executes the swap, and the net result is: more capital available for the trade than if the asset had sat uninvested.

---

### Aggregated Community Swaps

A Community Locker amplifies the individual trader model at group scale. Members contribute EVM assets to the community sub-vault. When the community votes to execute a swap — say, converting pooled BNB into SOL for a treasury deployment — the vault executes one aggregated transaction rather than 100 individual ones. Gas is shared. Slippage is minimized by the single large swap size. Every member receives their proportional SOL allocation to their individual vault.

No individual member had to navigate a bridge. No member had to figure out the optimal swap route. The community vault does the work. The MSL allocation for the swap action is distributed proportionally to members by contribution size.

---

### The Friction Argument Resolved

The honest friction analysis: wrapping an EVM asset to deposit it into a MonaSol vault is a one-time setup cost. After that, every subsequent cross-chain action is faster, cheaper, and more composable than any alternative. The protocol does not remove friction — it front-loads it and eliminates it for everything that follows.

| Action | Without MonaSol | With MonaSol |
|---|---|---|
| Swap BNB → SOL | CEX withdrawal (hours) or bridge (minutes, slippage) | Vault swap sub-vault (seconds, flat fee) |
| Earn on idle BNB | Manual DeFi position management | Automatic yield sub-vault, compounding |
| Prove assets to community | Share wallet address (trusted, not verified) | NFT key + locker TVL (on-chain, verifiable) |
| Group treasury swap | 100 individual swaps, each paying full gas | 1 aggregated vault swap, gas shared |
| Cross-chain collateral | Bridge then deposit (trust + slippage) | Pledge vault NFT to SharkyFi (no movement) |

---

### Revenue Implications

Every swap executed through a vault sub-vault generates a flat protocol fee of 0.002 SOL. An active trader executing 5 swaps per week generates 0.01 SOL per week in protocol revenue. At 10,000 active trading vaults executing 5 swaps per week each, that is 520 SOL per week (~$44,720 at current prices) from swap fees alone — before lease revenue, deposit fees, withdrawal fees, or transfer fees are counted.

The community aggregated swap model multiplies this further. A single community swap of 100 members generates one transaction fee split across 100 users — minimal cost per member — while the protocol collects the flat fee on the single transaction. High volume, low per-user friction, consistent protocol revenue.

---

### Chain Support Roadmap for Liquidity

| Phase | Chain Support |
|---|---|
| Phase 1 (now) | Monad EVM assets — any token deployed on Monad |
| Phase 2 | BNB Chain wrapped assets deposited into Monad vaults |
| Phase 3 | Ethereum mainnet assets via Monad bridge |
| Phase 4 | Solana native assets via Anchor lock program |
| Phase 5 | Any EVM chain via canonical bridge to Monad |

Phase 1 is live with the Monad testnet deployment. Each subsequent phase adds an asset class without changing the vault architecture. The sub-vault purpose model accommodates any asset type — the contract does not care what is inside, only who is authorized to move it.

---

*MonaSol Protocol — Semi-Final Draft, April 2026*

Chapter 1: Protocol Architecture | Chapter 2: Business Model, Token & Roadmap | Chapter 3: Community Lockers | Chapter 4: Cross-Chain Liquidity Management

© 2026 Cooperanth Consulting LLC. All Rights Reserved. | acooper@cooperanth.com | (978) 320-1714
