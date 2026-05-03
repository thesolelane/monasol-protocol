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
  updateLockerState(monadAddress: string, state: { usedSlots: number; status: string; minDepositSol: string }): Promise<Locker | undefined>;

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

    // Initialise protocol stats singleton if not yet present
    const existingStats = await db.select().from(protocolStats).limit(1);
    if (existingStats.length === 0) {
      await db.insert(protocolStats).values({
        id: "singleton",
        tvlUsd: "0.00",
        tvlTrend: "Testnet live",
        activeVaults: 0,
        maxVaults: 41150,
        nftKeysMinted: 0,
        nftUtilizationPct: 0,
        syncLatencyMs: 400,
        circuitBreakerActive: false,
      });
    }
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

  async updateLockerState(
    monadAddress: string,
    state: { usedSlots: number; status: string; minDepositSol: string }
  ): Promise<Locker | undefined> {
    const [locker] = await db
      .update(lockers)
      .set({ usedSlots: state.usedSlots, status: state.status, minDepositSol: state.minDepositSol })
      .where(eq(lockers.monadAddress, monadAddress))
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
