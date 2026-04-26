import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const protocolStats = pgTable("protocol_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tvlUsd: numeric("tvl_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  tvlTrend: text("tvl_trend").notNull().default("+0% this week"),
  activeVaults: integer("active_vaults").notNull().default(0),
  maxVaults: integer("max_vaults").notNull().default(1500),
  nftKeysMinted: integer("nft_keys_minted").notNull().default(0),
  nftUtilizationPct: integer("nft_utilization_pct").notNull().default(0),
  syncLatencyMs: integer("sync_latency_ms").notNull().default(400),
  circuitBreakerActive: boolean("circuit_breaker_active").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type ProtocolStats = typeof protocolStats.$inferSelect;

export const lockers = pgTable("lockers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalId: text("external_id").notNull().unique(),
  tier: integer("tier").notNull(),
  capacity: integer("capacity").notNull(),
  usedSlots: integer("used_slots").notNull().default(0),
  status: text("status").notNull().default("healthy"),
  minDepositSol: numeric("min_deposit_sol", { precision: 18, scale: 4 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertLockerSchema = createInsertSchema(lockers).omit({ id: true, createdAt: true });
export type InsertLocker = z.infer<typeof insertLockerSchema>;
export type Locker = typeof lockers.$inferSelect;

export const nftKeys = pgTable("nft_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mint: text("mint").notNull().unique(),
  name: text("name").notNull(),
  image: text("image"),
  vaultRef: text("vault_ref"),
  lockerRef: text("locker_ref"),
  walletAddress: text("wallet_address").notNull(),
  isTicket: boolean("is_ticket").notNull().default(false),
  transferLockDays: integer("transfer_lock_days").notNull().default(0),
  kycLevel: text("kyc_level").notNull().default("none"),
  eventName: text("event_name"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertNftKeySchema = createInsertSchema(nftKeys).omit({ id: true, createdAt: true });
export type InsertNftKey = z.infer<typeof insertNftKeySchema>;
export type NftKey = typeof nftKeys.$inferSelect;

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  venue: text("venue").notNull(),
  eventDate: text("event_date").notNull(),
  lockerRef: text("locker_ref"),
  saleDate: text("sale_date"),
  registrationDeadline: text("registration_deadline"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const ticketTiers = pgTable("ticket_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  tierId: text("tier_id").notNull(),
  label: text("label").notNull(),
  prefix: text("prefix").notNull(),
  capacity: integer("capacity").notNull(),
  maxSeats: integer("max_seats").notNull(),
  basePriceUsd: integer("base_price_usd").notNull(),
  releaseOffsetHours: integer("release_offset_hours").notNull().default(0),
  transferLockDays: integer("transfer_lock_days").notNull().default(0),
  kycLevel: text("kyc_level").notNull().default("none"),
  discounts: text("discounts").notNull().default("[]"),
});

export const insertTicketTierSchema = createInsertSchema(ticketTiers).omit({ id: true });
export type InsertTicketTier = z.infer<typeof insertTicketTierSchema>;
export type TicketTier = typeof ticketTiers.$inferSelect;

export const swapSessions = pgTable("swap_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  initiatorWallet: text("initiator_wallet").notNull(),
  offeredNftMint: text("offered_nft_mint").notNull(),
  counterpartyWallet: text("counterparty_wallet"),
  requestedNftMint: text("requested_nft_mint"),
  swapType: text("swap_type").notNull().default("sol-to-sol"),
  targetLocker: text("target_locker"),
  status: text("status").notNull().default("pending"),
  txSignature: text("tx_signature"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertSwapSessionSchema = createInsertSchema(swapSessions).omit({ id: true, createdAt: true });
export type InsertSwapSession = z.infer<typeof insertSwapSessionSchema>;
export type SwapSession = typeof swapSessions.$inferSelect;
