import { randomUUID } from "crypto";
import {
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private stats: ProtocolStats;
  private lockers: Map<string, Locker> = new Map();
  private nftKeys: Map<string, NftKey[]> = new Map();
  private events: Map<string, Event & { tiers: TicketTier[] }> = new Map();
  private swaps: Map<string, SwapSession> = new Map();

  constructor() {
    this.stats = {
      id: "singleton",
      tvlUsd: "4200000.00",
      tvlTrend: "+12% this week",
      activeVaults: 1284,
      maxVaults: 1500,
      nftKeysMinted: 4291,
      nftUtilizationPct: 89,
      syncLatencyMs: 400,
      circuitBreakerActive: false,
      updatedAt: new Date(),
    };

    this._seedLockers();
    this._seedNftKeys();
    this._seedEvents();
  }

  private _seedLockers() {
    const tiers = [
      { tier: 1, count: 82, capacity: 100, minDepositSol: "10", statusFn: (i: number) => i < 62 ? "full" : i < 75 ? "filling" : "healthy" },
      { tier: 2, count: 34, capacity: 500, minDepositSol: "1", statusFn: (i: number) => (i === 12 || i === 18) ? "distressed" : i < 31 ? "full" : "filling" },
      { tier: 3, count: 12, capacity: 10, minDepositSol: "1000", statusFn: (i: number) => i < 5 ? "full" : i < 9 ? "filling" : "healthy" },
    ];

    for (const t of tiers) {
      for (let i = 0; i < t.count; i++) {
        const id = randomUUID();
        const externalId = `LCK-T${t.tier}-${i}`;
        const status = t.statusFn(i);
        const usedSlots = status === "full" ? t.capacity :
          status === "filling" ? Math.floor(t.capacity * 0.6) :
          status === "distressed" ? t.capacity : 0;
        this.lockers.set(id, {
          id,
          externalId,
          tier: t.tier,
          capacity: t.capacity,
          usedSlots,
          status,
          minDepositSol: t.minDepositSol,
          createdAt: new Date(),
        });
      }
    }
  }

  private _seedNftKeys() {
    const demoWallet = "8xR...3kL";
    this.nftKeys.set(demoWallet, [
      {
        id: randomUUID(),
        mint: "7x2...9aB",
        name: "Vault Key #042",
        image: "https://images.unsplash.com/photo-1639815188546-c43c240ff4df?w=100&h=100&fit=crop",
        vaultRef: "VLT-042",
        lockerRef: "LCK-99A",
        walletAddress: demoWallet,
        isTicket: false,
        transferLockDays: 0,
        kycLevel: "none",
        eventName: null,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        mint: "3vP...m1K",
        name: "Alpha Access Pass",
        image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop",
        vaultRef: "VLT-881",
        lockerRef: "LCK-22B",
        walletAddress: demoWallet,
        isTicket: false,
        transferLockDays: 0,
        kycLevel: "none",
        eventName: null,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        mint: "9qZ...4tY",
        name: "Genesis Locker Key",
        image: "https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?w=100&h=100&fit=crop",
        vaultRef: "VLT-112",
        lockerRef: "LCK-45C",
        walletAddress: demoWallet,
        isTicket: false,
        transferLockDays: 0,
        kycLevel: "none",
        eventName: null,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        mint: "9mK2...7pR",
        name: "🎵 #021*025-15",
        image: null,
        vaultRef: null,
        lockerRef: null,
        walletAddress: demoWallet,
        isTicket: true,
        transferLockDays: 18,
        kycLevel: "soft",
        eventName: "The Midnight — MSG, June 14 2027",
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        mint: "4bX8...2qL",
        name: "🎵 #VIP-014",
        image: null,
        vaultRef: null,
        lockerRef: null,
        walletAddress: demoWallet,
        isTicket: true,
        transferLockDays: 0,
        kycLevel: "hard",
        eventName: "The Midnight — MSG, June 14 2027",
        createdAt: new Date(),
      },
    ]);
  }

  private _seedEvents() {
    const eventId = randomUUID();
    const tiers: TicketTier[] = [
      {
        id: randomUUID(),
        eventId,
        tierId: "general",
        label: "General",
        prefix: "#",
        capacity: 8000,
        maxSeats: 5,
        basePriceUsd: 85,
        releaseOffsetHours: 0,
        transferLockDays: 30,
        kycLevel: "soft",
        discounts: JSON.stringify([{ qty: 2, amount: 5 }, { qty: 3, amount: 10 }, { qty: 5, amount: 15 }]),
      },
      {
        id: randomUUID(),
        eventId,
        tierId: "premium",
        label: "Premium",
        prefix: "#PRE-",
        capacity: 2000,
        maxSeats: 3,
        basePriceUsd: 175,
        releaseOffsetHours: 0,
        transferLockDays: 14,
        kycLevel: "standard",
        discounts: JSON.stringify([{ qty: 2, amount: 10 }, { qty: 3, amount: 20 }]),
      },
      {
        id: randomUUID(),
        eventId,
        tierId: "vip",
        label: "VIP",
        prefix: "#VIP-",
        capacity: 200,
        maxSeats: 2,
        basePriceUsd: 350,
        releaseOffsetHours: 48,
        transferLockDays: 0,
        kycLevel: "hard",
        discounts: JSON.stringify([]),
      },
      {
        id: randomUUID(),
        eventId,
        tierId: "accessible",
        label: "Accessible",
        prefix: "#ACC-",
        capacity: 100,
        maxSeats: 2,
        basePriceUsd: 85,
        releaseOffsetHours: 0,
        transferLockDays: 30,
        kycLevel: "soft",
        discounts: JSON.stringify([]),
      },
    ];

    this.events.set(eventId, {
      id: eventId,
      name: "The Midnight — Endless Summer Tour",
      venue: "Madison Square Garden, New York",
      eventDate: "June 14, 2027 — 8:00 PM EDT",
      lockerRef: "LCK-7821...449",
      saleDate: "May 1, 2027 — 10:00 AM EDT",
      registrationDeadline: "April 29, 2027",
      isActive: true,
      createdAt: new Date(),
      tiers,
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getProtocolStats(): Promise<ProtocolStats> {
    return this.stats;
  }

  async getLockers(): Promise<Locker[]> {
    return Array.from(this.lockers.values());
  }

  async getLockersByTier(tier: number): Promise<Locker[]> {
    return Array.from(this.lockers.values()).filter((l) => l.tier === tier);
  }

  async getNftsByWallet(wallet: string): Promise<NftKey[]> {
    return this.nftKeys.get(wallet) ?? [];
  }

  async getCurrentEvent(): Promise<(Event & { tiers: TicketTier[] }) | undefined> {
    const activeEvents = Array.from(this.events.values()).filter((e) => e.isActive);
    return activeEvents[0];
  }

  async createSwapSession(data: InsertSwapSession): Promise<SwapSession> {
    const id = randomUUID();
    const session: SwapSession = {
      id,
      token: data.token,
      initiatorWallet: data.initiatorWallet,
      offeredNftMint: data.offeredNftMint,
      counterpartyWallet: data.counterpartyWallet ?? null,
      requestedNftMint: data.requestedNftMint ?? null,
      swapType: data.swapType ?? "sol-to-sol",
      targetLocker: data.targetLocker ?? null,
      status: data.status ?? "pending",
      txSignature: data.txSignature ?? null,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
    };
    this.swaps.set(data.token, session);
    return session;
  }

  async getSwapSessionByToken(token: string): Promise<SwapSession | undefined> {
    return this.swaps.get(token);
  }

  async updateSwapSessionStatus(token: string, status: string, txSig?: string): Promise<SwapSession | undefined> {
    const session = this.swaps.get(token);
    if (!session) return undefined;
    const updated = { ...session, status, txSignature: txSig ?? session.txSignature };
    this.swaps.set(token, updated);
    return updated;
  }
}

export const storage = new MemStorage();
