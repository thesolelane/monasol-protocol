import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  users, protocolStats, lockers, nftKeys, events, ticketTiers, swapSessions, vaultSessions, sessionHistory, vaults, vaultTransactions,
  type User,
  type InsertUser,
  type ProtocolStats,
  type Locker,
  type NftKey,
  type Event,
  type TicketTier,
  type SwapSession,
  type InsertSwapSession,
  type VaultSession,
  type InsertVaultSession,
  type SessionHistoryEntry,
  type InsertSessionHistory,
  type Vault,
  type InsertVault,
} from "@workspace/db";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getProtocolStats(): Promise<ProtocolStats>;

  getLockers(): Promise<Locker[]>;
  getLockersByTier(tier: number): Promise<Locker[]>;

  getNftsByWallet(wallet: string): Promise<NftKey[]>;

  getCurrentEvent(): Promise<(Event & { tiers: TicketTier[] }) | undefined>;

  createSwapSession(data: InsertSwapSession): Promise<SwapSession>;
  getSwapSessionByToken(token: string): Promise<SwapSession | undefined>;
  updateSwapSessionStatus(token: string, status: string, txSig?: string): Promise<SwapSession | undefined>;

  updateLockerMonadAddress(lockerId: string, monadAddress: string): Promise<Locker | undefined>;

  createVault(data: InsertVault): Promise<Vault>;
  getVaultBySlot(locker: string, slotIndex: number): Promise<Vault | null>;
  getVaultByAddress(address: string): Promise<Vault | null>;
  logTransaction(data: {
    vaultAddress: string;
    action: "deploy" | "move_in" | "session_open" | "session_close" | "lease_transfer" | "oracle_register" | "oracle_settle" | "oracle_finalize";
    txHash: string;
    callerWallet: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void>;
  updateVaultSessionState(mint: string, sessionOpen: boolean, sessionExpiresAt: Date | null, readOnly: boolean): Promise<NftKey | undefined>;

  getActiveVaultSession(vaultId: string, nftMint: string): Promise<VaultSession | undefined>;
  createVaultSession(data: InsertVaultSession): Promise<VaultSession>;
  closeVaultSession(vaultId: string, nftMint: string): Promise<VaultSession | undefined>;

  getSessionHistory(vaultId: string, ownerWallet: string): Promise<SessionHistoryEntry[] | null>;
  createSessionHistoryEntry(data: InsertSessionHistory): Promise<SessionHistoryEntry>;
  setVaultHistorySharing(vaultId: string, ownerWallet: string, share: boolean): Promise<boolean>;
  getSystemSessionAggregate(vaultId: string): Promise<{ totalSessions: number; totalDurationMs: number; lastActivityAt: Date | null } | null>;
  getProtocolVaultActivityAggregate(): Promise<{ optedInVaults: number; totalSessions: number; totalDurationMs: number; lastActivityAt: Date | null }>;
}

export class DrizzleStorage implements IStorage {
  private seeded = false;

  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;

    // Seed protocol stats if empty
    const existingStats = await db.select().from(protocolStats).limit(1);
    if (existingStats.length === 0) {
      await db.insert(protocolStats).values({
        id: "singleton",
        tvlUsd: "4200000.00",
        tvlTrend: "+12% this week",
        activeVaults: 1284,
        maxVaults: 1500,
        nftKeysMinted: 4291,
        nftUtilizationPct: 89,
        syncLatencyMs: 400,
        circuitBreakerActive: false,
      });
    }

    // Seed NFT keys if empty
    const existingNfts = await db.select().from(nftKeys).limit(1);
    if (existingNfts.length === 0) {
      await this._seedNftKeys();
    }

    // Seed events if empty
    const existingEvents = await db.select().from(events).limit(1);
    if (existingEvents.length === 0) {
      await this._seedEvents();
    }

    // Seed session history if empty
    const existingHistory = await db.select().from(sessionHistory).limit(1);
    if (existingHistory.length === 0) {
      await this._seedSessionHistory();
    }
  }

  private async _seedNftKeys(): Promise<void> {
    const demoWallet = "8xR...3kL";
    await db.insert(nftKeys).values([
      { mint: "7x2...9aB", name: "Vault Key #042",   image: "https://images.unsplash.com/photo-1639815188546-c43c240ff4df?w=100&h=100&fit=crop", vaultRef: "VLT-042", lockerRef: "LCK-99A", walletAddress: demoWallet, isTicket: false, transferLockDays: 0, kycLevel: "none" },
      { mint: "3vP...m1K", name: "Alpha Access Pass", image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop", vaultRef: "VLT-881", lockerRef: "LCK-22B", walletAddress: demoWallet, isTicket: false, transferLockDays: 0, kycLevel: "none" },
      { mint: "9qZ...4tY", name: "Genesis Locker Key", image: "https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?w=100&h=100&fit=crop", vaultRef: "VLT-112", lockerRef: "LCK-45C", walletAddress: demoWallet, isTicket: false, transferLockDays: 0, kycLevel: "none" },
      { mint: "9mK2...7pR", name: "🎵 #021*025-15", walletAddress: demoWallet, isTicket: true, transferLockDays: 18, kycLevel: "soft", eventName: "The Midnight — MSG, June 14 2027" },
      { mint: "4bX8...2qL", name: "🎵 #VIP-014",    walletAddress: demoWallet, isTicket: true, transferLockDays: 0, kycLevel: "hard", eventName: "The Midnight — MSG, June 14 2027" },
    ]);
  }

  private async _seedSessionHistory(): Promise<void> {
    const demoWallet = "8xR...3kL";
    const now = Date.now();
    const hour = 3_600_000;
    const entries = [
      { vaultId: "VLT-042", ownerWallet: demoWallet, sessionId: "SES-A1B2C3", label: "DeFi bridge access",  authorizedAddress: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", openedAt: new Date(now - 10 * 24 * hour), closedAt: new Date(now - 10 * 24 * hour + 8 * hour),   durationMs: 8 * hour, shareWithProtocol: false },
      { vaultId: "VLT-042", ownerWallet: demoWallet, sessionId: "SES-D4E5F6", label: "Collateral proof",     authorizedAddress: "Any holder",                                                    openedAt: new Date(now - 7 * 24 * hour),  closedAt: new Date(now - 7 * 24 * hour + hour),      durationMs: hour,     shareWithProtocol: false },
      { vaultId: "VLT-042", ownerWallet: demoWallet, sessionId: "SES-G7H8I9", label: "Governance vote",      authorizedAddress: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", openedAt: new Date(now - 3 * 24 * hour),  closedAt: new Date(now - 3 * 24 * hour + 24 * hour), durationMs: 24 * hour, shareWithProtocol: false },
      { vaultId: "VLT-881", ownerWallet: demoWallet, sessionId: "SES-J1K2L3", label: "General session",      authorizedAddress: "Any holder",                                                    openedAt: new Date(now - 14 * 24 * hour), closedAt: new Date(now - 14 * 24 * hour + hour),     durationMs: hour,     shareWithProtocol: false },
      { vaultId: "VLT-881", ownerWallet: demoWallet, sessionId: "SES-M4N5O6", label: "Alpha access check",   authorizedAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", openedAt: new Date(now - 5 * 24 * hour),  closedAt: new Date(now - 5 * 24 * hour + 8 * hour),  durationMs: 8 * hour, shareWithProtocol: false },
      { vaultId: "VLT-112", ownerWallet: demoWallet, sessionId: "SES-P7Q8R9", label: "Genesis vault unlock", authorizedAddress: "Any holder",                                                    openedAt: new Date(now - 20 * 24 * hour), closedAt: new Date(now - 20 * 24 * hour + 8 * hour), durationMs: 8 * hour, shareWithProtocol: false },
    ];
    await db.insert(sessionHistory).values(entries);
  }

  private async _seedEvents(): Promise<void> {
    const eventId = randomUUID();
    await db.insert(events).values({
      id: eventId,
      name: "The Midnight — Endless Summer Tour",
      venue: "Madison Square Garden, New York",
      eventDate: "June 14, 2027 — 8:00 PM EDT",
      lockerRef: "LCK-7821...449",
      saleDate: "May 1, 2027 — 10:00 AM EDT",
      registrationDeadline: "April 29, 2027",
      isActive: true,
    });
    await db.insert(ticketTiers).values([
      { eventId, tierId: "general",    label: "General",    prefix: "#",      capacity: 8000, maxSeats: 5, basePriceUsd: 85,  releaseOffsetHours: 0,  transferLockDays: 30, kycLevel: "soft",     discounts: JSON.stringify([{qty:2,amount:5},{qty:3,amount:10},{qty:5,amount:15}]) },
      { eventId, tierId: "premium",    label: "Premium",    prefix: "#PRE-",  capacity: 2000, maxSeats: 3, basePriceUsd: 175, releaseOffsetHours: 0,  transferLockDays: 14, kycLevel: "standard", discounts: JSON.stringify([{qty:2,amount:10},{qty:3,amount:20}]) },
      { eventId, tierId: "vip",        label: "VIP",        prefix: "#VIP-",  capacity: 200,  maxSeats: 2, basePriceUsd: 350, releaseOffsetHours: 48, transferLockDays: 0,  kycLevel: "hard",     discounts: JSON.stringify([]) },
      { eventId, tierId: "accessible", label: "Accessible", prefix: "#ACC-",  capacity: 100,  maxSeats: 2, basePriceUsd: 85,  releaseOffsetHours: 0,  transferLockDays: 30, kycLevel: "soft",     discounts: JSON.stringify([]) },
    ]);
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.ensureSeeded();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureSeeded();
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    await this.ensureSeeded();
    const [user] = await db.insert(users).values({ ...insertUser, id: randomUUID() }).returning();
    return user;
  }

  async getProtocolStats(): Promise<ProtocolStats> {
    await this.ensureSeeded();
    const [stats] = await db.select().from(protocolStats).where(eq(protocolStats.id, "singleton"));
    return stats;
  }

  async getLockers(): Promise<Locker[]> {
    await this.ensureSeeded();
    return db.select().from(lockers);
  }

  async getLockersByTier(tier: number): Promise<Locker[]> {
    await this.ensureSeeded();
    return db.select().from(lockers).where(eq(lockers.tier, tier));
  }

  async getNftsByWallet(wallet: string): Promise<NftKey[]> {
    await this.ensureSeeded();
    return db.select().from(nftKeys).where(eq(nftKeys.walletAddress, wallet));
  }

  async getCurrentEvent(): Promise<(Event & { tiers: TicketTier[] }) | undefined> {
    await this.ensureSeeded();
    const [event] = await db.select().from(events).where(eq(events.isActive, true));
    if (!event) return undefined;
    const tiers = await db.select().from(ticketTiers).where(eq(ticketTiers.eventId, event.id));
    return { ...event, tiers };
  }

  async createSwapSession(data: InsertSwapSession): Promise<SwapSession> {
    await this.ensureSeeded();
    const [session] = await db.insert(swapSessions).values({ ...data, id: randomUUID() }).returning();
    return session;
  }

  async getSwapSessionByToken(token: string): Promise<SwapSession | undefined> {
    await this.ensureSeeded();
    const [session] = await db.select().from(swapSessions).where(eq(swapSessions.token, token));
    return session;
  }

  async updateSwapSessionStatus(token: string, status: string, txSig?: string): Promise<SwapSession | undefined> {
    await this.ensureSeeded();
    const [session] = await db
      .update(swapSessions)
      .set({ status, txSignature: txSig })
      .where(eq(swapSessions.token, token))
      .returning();
    return session;
  }

  async updateLockerMonadAddress(lockerId: string, monadAddress: string): Promise<Locker | undefined> {
    await this.ensureSeeded();
    const [locker] = await db
      .update(lockers)
      .set({ monadAddress })
      .where(eq(lockers.id, lockerId))
      .returning();
    return locker;
  }

  async createVault(data: InsertVault): Promise<Vault> {
    const [vault] = await db
      .insert(vaults)
      .values({ ...data, id: randomUUID() })
      .returning();
    return vault;
  }

  async getVaultBySlot(locker: string, slotIndex: number): Promise<Vault | null> {
    const rows = await db
      .select()
      .from(vaults)
      .where(eq(vaults.locker, locker));
    return rows.find(v => v.slotIndex === slotIndex) ?? null;
  }

  async getVaultByAddress(address: string): Promise<Vault | null> {
    const [vault] = await db
      .select()
      .from(vaults)
      .where(eq(vaults.address, address));
    return vault ?? null;
  }

  async logTransaction(data: {
    vaultAddress: string;
    action: "deploy" | "move_in" | "session_open" | "session_close" | "lease_transfer" | "oracle_register" | "oracle_settle" | "oracle_finalize";
    txHash: string;
    callerWallet: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void> {
    await db.insert(vaultTransactions).values({
      id:           randomUUID(),
      vaultAddress: data.vaultAddress,
      action:       data.action,
      txHash:       data.txHash,
      callerWallet: data.callerWallet,
      metadata:     data.metadata ? JSON.stringify(data.metadata) : null,
      createdAt:    data.createdAt,
    });
  }

  async updateVaultSessionState(
    mint: string,
    sessionOpen: boolean,
    sessionExpiresAt: Date | null,
    readOnly: boolean,
  ): Promise<NftKey | undefined> {
    await this.ensureSeeded();
    const [nft] = await db
      .update(nftKeys)
      .set({ sessionOpen, sessionExpiresAt, readOnly })
      .where(eq(nftKeys.mint, mint))
      .returning();
    return nft;
  }

  async getActiveVaultSession(vaultId: string, nftMint: string): Promise<VaultSession | undefined> {
    await this.ensureSeeded();
    const now = new Date();
    const rows = await db.select().from(vaultSessions)
      .where(eq(vaultSessions.vaultId, vaultId));
    const candidates = rows
      .filter(r => r.nftMint === nftMint && (r.status === "open" || r.status === "expired"))
      .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
    const latest = candidates[0];
    if (!latest) return undefined;
    if (latest.status === "open" && latest.expiresAt < now) {
      await db.update(vaultSessions).set({ status: "expired" }).where(eq(vaultSessions.id, latest.id));
      return { ...latest, status: "expired" };
    }
    return latest;
  }

  async createVaultSession(data: InsertVaultSession): Promise<VaultSession> {
    await this.ensureSeeded();
    const existing = await db.select().from(vaultSessions)
      .where(eq(vaultSessions.vaultId, data.vaultId));
    const toClose = existing.filter(r => r.nftMint === data.nftMint && (r.status === "open" || r.status === "expired"));
    for (const row of toClose) {
      await db.update(vaultSessions)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(vaultSessions.id, row.id));
    }
    const [session] = await db.insert(vaultSessions)
      .values({ ...data, id: randomUUID() })
      .returning();
    return session;
  }

  async closeVaultSession(vaultId: string, nftMint: string): Promise<VaultSession | undefined> {
    await this.ensureSeeded();
    const rows = await db.select().from(vaultSessions).where(eq(vaultSessions.vaultId, vaultId));
    const active = rows
      .filter(r => r.nftMint === nftMint && (r.status === "open" || r.status === "expired"))
      .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
    if (!active) return undefined;
    const [updated] = await db.update(vaultSessions)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(vaultSessions.id, active.id))
      .returning();
    return updated;
  }

  async getSessionHistory(vaultId: string, ownerWallet: string): Promise<SessionHistoryEntry[] | null> {
    await this.ensureSeeded();
    const ownerNft = await db
      .select()
      .from(nftKeys)
      .where(eq(nftKeys.walletAddress, ownerWallet))
      .then(rows => rows.find(n => n.vaultRef === vaultId));
    if (!ownerNft) return null;
    return db
      .select()
      .from(sessionHistory)
      .where(eq(sessionHistory.vaultId, vaultId))
      .orderBy(desc(sessionHistory.openedAt));
  }

  async createSessionHistoryEntry(data: InsertSessionHistory): Promise<SessionHistoryEntry> {
    await this.ensureSeeded();
    const [entry] = await db
      .insert(sessionHistory)
      .values({ ...data, id: randomUUID() })
      .returning();
    return entry;
  }

  async setVaultHistorySharing(vaultId: string, ownerWallet: string, share: boolean): Promise<boolean> {
    await this.ensureSeeded();
    const ownerNft = await db
      .select()
      .from(nftKeys)
      .where(eq(nftKeys.walletAddress, ownerWallet))
      .then(rows => rows.find(n => n.vaultRef === vaultId));
    if (!ownerNft) return false;
    await db
      .update(sessionHistory)
      .set({ shareWithProtocol: share })
      .where(eq(sessionHistory.vaultId, vaultId));
    return true;
  }

  async getSystemSessionAggregate(vaultId: string): Promise<{ totalSessions: number; totalDurationMs: number; lastActivityAt: Date | null } | null> {
    await this.ensureSeeded();
    const entries = await db
      .select()
      .from(sessionHistory)
      .where(eq(sessionHistory.vaultId, vaultId))
      .then(rows => rows.filter(r => r.shareWithProtocol));
    if (entries.length === 0) return null;
    const totalDurationMs = entries.reduce((sum, e) => sum + e.durationMs, 0);
    const lastActivityAt = entries.reduce<Date | null>((latest, e) => {
      return !latest || e.closedAt > latest ? e.closedAt : latest;
    }, null);
    return { totalSessions: entries.length, totalDurationMs, lastActivityAt };
  }

  async getProtocolVaultActivityAggregate(): Promise<{ optedInVaults: number; totalSessions: number; totalDurationMs: number; lastActivityAt: Date | null }> {
    await this.ensureSeeded();
    const entries = await db
      .select()
      .from(sessionHistory)
      .then(rows => rows.filter(r => r.shareWithProtocol));
    const optedInVaults = new Set(entries.map(e => e.vaultId)).size;
    const totalSessions = entries.length;
    const totalDurationMs = entries.reduce((sum, e) => sum + e.durationMs, 0);
    const lastActivityAt = entries.reduce<Date | null>((latest, e) => {
      return !latest || e.closedAt > latest ? e.closedAt : latest;
    }, null);
    return { optedInVaults, totalSessions, totalDurationMs, lastActivityAt };
  }
}

export const storage = new DrizzleStorage();
