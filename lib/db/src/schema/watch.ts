import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchNodes = pgTable("watch_nodes", {
  walletAddress:          text("wallet_address").primaryKey(),
  chain:                  text("chain").notNull(),
  xHandle:                text("x_handle").notNull(),
  telegramHandle:         text("telegram_handle").notNull(),
  discordHandle:          text("discord_handle").notNull(),
  devicePublicKey:        text("device_public_key").notNull(),
  status:                 text("status").notNull().default("PENDING"),
  rejectionReason:        text("rejection_reason"),
  tier:                   integer("tier").notNull().default(1),
  registeredAt:           timestamp("registered_at").notNull().default(sql`now()`),
  verificationDue:        timestamp("verification_due").notNull(),
  uptimeStart:            timestamp("uptime_start").notNull().default(sql`now()`),
  reportCount:            integer("report_count").notNull().default(0),
  lockerCount:            integer("locker_count").notNull().default(0),
  consecutiveFailedChecks: integer("consecutive_failed_checks").notNull().default(0),
  nextRecheckAt:          timestamp("next_recheck_at").notNull(),
  updatedAt:              timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertWatchNodeSchema = createInsertSchema(watchNodes).omit({
  registeredAt: true,
  uptimeStart: true,
  updatedAt: true,
});
export type InsertWatchNode = z.infer<typeof insertWatchNodeSchema>;
export type WatchNode = typeof watchNodes.$inferSelect;

export const watchNonces = pgTable(
  "watch_nonces",
  {
    id:            text("id").primaryKey().default(sql`gen_random_uuid()`),
    walletAddress: text("wallet_address").notNull(),
    nonce:         text("nonce").notNull(),
    createdAt:     timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex("watch_nonces_wallet_nonce_idx").on(t.walletAddress, t.nonce)],
);

export type WatchNonce = typeof watchNonces.$inferSelect;

export const watchReports = pgTable("watch_reports", {
  id:            text("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  lockerAddress: text("locker_address").notNull(),
  alertType:     text("alert_type").notNull(),
  severity:      integer("severity").notNull().default(1),
  nonce:         text("nonce").notNull(),
  createdAt:     timestamp("created_at").notNull().default(sql`now()`),
});

export const insertWatchReportSchema = createInsertSchema(watchReports).omit({
  id: true,
  createdAt: true,
});
export type InsertWatchReport = z.infer<typeof insertWatchReportSchema>;
export type WatchReport = typeof watchReports.$inferSelect;

export const watchAuditLog = pgTable("watch_audit_log", {
  id:            text("id").primaryKey().default(sql`gen_random_uuid()`),
  event:         text("event").notNull(),
  ip:            text("ip").notNull(),
  walletAddress: text("wallet_address"),
  detail:        text("detail"),
  createdAt:     timestamp("created_at").notNull().default(sql`now()`),
});

export type WatchAuditEntry = typeof watchAuditLog.$inferSelect;
