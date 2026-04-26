import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  users, protocolStats, lockers, nftKeys, events, ticketTiers, swapSessions,
  type User,
  type InsertUser,
  type ProtocolStats,
  type Locker,
  type NftKey,
  type Event,
  type TicketTier,
  type SwapSession,
  type InsertSwapSession,
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
  updateVaultSessionState(mint: string, sessionOpen: boolean, sessionExpiresAt: Date | null, readOnly: boolean): Promise<NftKey | undefined>;
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

    // Seed lockers if empty
    const existingLockers = await db.select().from(lockers).limit(1);
    if (existingLockers.length === 0) {
      await this._seedLockers();
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
  }

  private async _seedLockers(): Promise<void> {
    const tiers = [
      { tier: 1, count: 82, capacity: 100, minDepositSol: "10", statusFn: (i: number) => i < 62 ? "full" : i < 75 ? "filling" : "healthy" },
      { tier: 2, count: 34, capacity: 500, minDepositSol: "1",  statusFn: (i: number) => (i === 12 || i === 18) ? "distressed" : i < 31 ? "full" : "filling" },
      { tier: 3, count: 12, capacity: 10,  minDepositSol: "1000", statusFn: (i: number) => i < 5 ? "full" : i < 9 ? "filling" : "healthy" },
    ];

    for (const t of tiers) {
      const batch = [];
      for (let i = 0; i < t.count; i++) {
        const status = t.statusFn(i);
        const usedSlots = status === "full" ? t.capacity : status === "filling" ? Math.floor(t.capacity * 0.6) : status === "distressed" ? t.capacity : 0;
        batch.push({ externalId: `LCK-T${t.tier}-${i}`, tier: t.tier, capacity: t.capacity, usedSlots, status, minDepositSol: t.minDepositSol });
      }
      await db.insert(lockers).values(batch);
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
}

export const storage = new DrizzleStorage();
