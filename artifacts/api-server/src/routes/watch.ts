import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, desc, eq, gt, lt, lte, sql } from "drizzle-orm";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import nacl from "tweetnacl";
import { db } from "@workspace/db";
import {
  lockers,
  watchNodes,
  watchNonces,
  watchReports,
  watchAuditLog,
  type WatchNode,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

// ─── Ping accumulator (in-memory, flushed by batch worker) ───────────────────
/**
 * Accumulates ping timestamps from Tier 1 Community Nodes before the oracle
 * wallet submits them to NeighborhoodWatch.vy in batches.
 *
 * Map<walletAddress, timestamp[]>
 *
 * Bounded per-wallet: max PING_BUFFER_MAX_PER_WALLET entries (oldest are
 * compacted out). Entries older than PING_BUFFER_TTL_MS are dropped at flush
 * time so the buffer cannot grow unboundedly when oracle submission is down.
 */
const pingBuffer = new Map<string, number[]>();
const PING_BUFFER_MAX_PER_WALLET = 24;   // 24 × 5-min pings = 2 hours max in-memory
const PING_BUFFER_TTL_MS = 2 * 60 * 60 * 1000; // drop timestamps older than 2 hours

// ─── Server-side feature flags ────────────────────────────────────────────────
const serverFlags = {
  monadWalletEnabled:          process.env.FLAG_MONAD_WALLET === "true",
  neighborhoodWatchEnabled:    process.env.FLAG_NEIGHBORHOOD_WATCH === "true",
  mslTokenAddressSolana:       process.env.MSL_TOKEN_SOLANA ?? "",
  mslTokenAddressMonad:        process.env.MSL_TOKEN_MONAD ?? "",
  mprotocolFollowCheckEnabled: process.env.MPROTOCOL_FOLLOW_CHECK === "true",
};

// Admin secret
const ADMIN_SECRET =
  process.env.WATCH_ADMIN_SECRET || randomBytes(24).toString("hex");

if (!process.env.WATCH_ADMIN_SECRET) {
  logger.warn(
    "watch: WATCH_ADMIN_SECRET env var not set — set it to use a stable admin secret",
  );
}

// Chain RPC URLs (optional — enables real on-chain verification)
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "";
const MONAD_RPC_URL  = process.env.MONAD_RPC_URL ?? "";

// ─── Eligibility thresholds ───────────────────────────────────────────────────
const THIRTY_DAYS_MS        = 30 * 24 * 60 * 60 * 1000;
const NONCE_TTL_MS          = 5  * 60 * 1000;
const SIX_MONTHS_MS         = 180 * 24 * 60 * 60 * 1000; // wallet must be >= 6 months old
const TWO_MONTHS_MS         = 60  * 24 * 60 * 60 * 1000; // size of each activity window
const REQUIRED_WINDOWS      = 3;                           // must show activity in all 3 windows

// ─── Admin session token helpers ──────────────────────────────────────────────

const ADMIN_TOKEN_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Validate a short-lived HMAC session token issued by POST /watch/admin/token.
 * Format: "<expiresAtMs>:<HMAC-SHA256 hex>"
 * The password never travels to the browser as a bundled env var; the operator
 * enters it at runtime, exchanges it for a token that is stored in sessionStorage
 * only, and the raw password is forgotten.
 */
function validateAdminToken(token: string): boolean {
  const colonIdx = token.indexOf(":");
  if (colonIdx === -1) return false;
  const expStr = token.slice(0, colonIdx);
  const mac    = token.slice(colonIdx + 1);
  const expiresAt = parseInt(expStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
  const expected = createHmac("sha256", ADMIN_SECRET)
    .update(`admin:${expiresAt}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ─── Admin brute-force lockout (in-process per IP) ────────────────────────────
const ADMIN_MAX_FAILURES      = 5;
const ADMIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOCKOUT_MS        = 30 * 60 * 1000;

interface AdminAttempt {
  failures: number[];
  lockedUntil: number;
}
const adminAttempts = new Map<string, AdminAttempt>();

// ─── Device key rotation challenges (in-process per wallet) ──────────────────
const ROTATION_CHALLENGE_TTL = 5 * 60 * 1000;

interface RotationChallenge {
  nonce: string;
  expiresAt: number;
}
const rotationChallenges = new Map<string, RotationChallenge>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function checkAdminAuth(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const ip = getClientIp(req);

  const attempt = adminAttempts.get(ip) ?? { failures: [], lockedUntil: 0 };
  if (Date.now() < attempt.lockedUntil) {
    const remaining = Math.ceil((attempt.lockedUntil - Date.now()) / 60_000);
    audit("admin_brute_force_blocked", ip, undefined, `locked for ${remaining}min`);
    return { ok: false, status: 429, error: `Too many failed attempts. Try again in ${remaining} minutes.` };
  }

  // Accept either a runtime HMAC session token (Bearer — preferred, not bundled
  // in frontend code) or the raw secret via legacy x-admin-secret header
  // (kept for server-to-server / curl usage only; never put in browser bundles).
  const authHeader   = req.headers["authorization"];
  const secretHeader = req.headers["x-admin-secret"];

  let authed = false;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    authed = validateAdminToken(authHeader.slice(7));
  } else if (typeof secretHeader === "string" && secretHeader === ADMIN_SECRET) {
    authed = true;
  }

  if (!authed) {
    const now = Date.now();
    const recent = attempt.failures.filter(t => now - t < ADMIN_FAILURE_WINDOW_MS);
    recent.push(now);
    const lockedUntil = recent.length >= ADMIN_MAX_FAILURES ? now + ADMIN_LOCKOUT_MS : 0;
    adminAttempts.set(ip, { failures: recent, lockedUntil });
    if (lockedUntil) {
      logger.warn({ ip }, "watch: admin IP locked out after repeated failures");
      audit("admin_locked_out", ip, undefined, `${recent.length} failures`);
    } else {
      audit("admin_auth_fail", ip, undefined, `attempt ${recent.length}/${ADMIN_MAX_FAILURES}`);
    }
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  adminAttempts.set(ip, { failures: [], lockedUntil: 0 });
  return { ok: true };
}

function audit(event: string, ip: string, walletAddress?: string, detail?: string): void {
  db.insert(watchAuditLog)
    .values({ event, ip, walletAddress: walletAddress ?? null, detail: detail ?? null })
    .catch((err) => logger.error({ err }, "watch: audit log write failed"));
}

// ─── IP Rate limiters ─────────────────────────────────────────────────────────

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler(req, res) {
    audit("register_rate_limited", getClientIp(req));
    res.status(429).json({ error: "Too many registration attempts. Try again later." });
  },
});

const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler(_req, res) {
    res.status(429).json({ error: "Too many status requests." });
  },
});

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler(req, res) {
    const ip = getClientIp(req);
    audit("report_rate_limited", ip, req.body?.walletAddress as string | undefined);
    res.status(429).json({ error: "Too many report submissions. Slow down." });
  },
});

const pingLimiter = rateLimit({
  windowMs: 4 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const wallet = (req.body as Record<string, string>)?.walletAddress ?? getClientIp(req);
    return wallet;
  },
  handler(_req, res) {
    res.status(429).json({ error: "Ping already recorded. Minimum interval is 4 minutes." });
  },
});

// ─── Validation helpers ───────────────────────────────────────────────────────

function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function isMonadAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(addr);
}

function isValidXHandle(handle: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(handle);
}

/** Enforce HTTPS for all RPC URLs to prevent plaintext credential leakage. */
function assertHttpsRpcUrl(url: string, label: string): void {
  if (!url.startsWith("https://")) {
    throw new Error(`${label} must use HTTPS (got: ${url.slice(0, 20)}...)`);
  }
}

// ─── Ed25519 signature verification ──────────────────────────────────────────

/**
 * Verify an Ed25519 detached signature over the canonical report message.
 *
 * Canonical message: report:<wallet>:<locker>:<alertType>:<severity>:<nonce>:<timestamp>
 *
 * The client signs with its Ed25519 private key (stored in SecureStore, never transmitted).
 * The server verifies against the public key stored in watch_nodes.devicePublicKey.
 */
function verifyReportSignature(
  publicKeyHex: string,
  walletAddress: string,
  lockerAddress: string,
  alertType: string,
  severity: number,
  nonce: string,
  timestamp: number,
  signatureHex: string,
): boolean {
  if (signatureHex.length !== 128) return false;
  if (publicKeyHex.length !== 64)  return false;
  try {
    const canonical = `report:${walletAddress}:${lockerAddress}:${alertType}:${severity}:${nonce}:${timestamp}`;
    const msg    = Buffer.from(canonical, "utf8");
    const sig    = Buffer.from(signatureHex, "hex");
    const pubKey = Buffer.from(publicKeyHex, "hex");
    return nacl.sign.detached.verify(
      new Uint8Array(msg),
      new Uint8Array(sig),
      new Uint8Array(pubKey),
    );
  } catch {
    return false;
  }
}

/**
 * Verify a rotation signature: Ed25519_sign("rotate:<challenge>:<newPublicKey>", OLD_SK)
 *
 * Forces the caller to prove ownership of the current private key before the
 * server will accept any new public key. Unauthenticated rotations are rejected.
 */
function verifyRotationSignature(
  currentPublicKeyHex: string,
  challenge: string,
  newPublicKeyHex: string,
  signatureHex: string,
): boolean {
  if (signatureHex.length !== 128) return false;
  if (currentPublicKeyHex.length !== 64) return false;
  try {
    const canonical = `rotate:${challenge}:${newPublicKeyHex}`;
    const msg    = Buffer.from(canonical, "utf8");
    const sig    = Buffer.from(signatureHex, "hex");
    const pubKey = Buffer.from(currentPublicKeyHex, "hex");
    return nacl.sign.detached.verify(
      new Uint8Array(msg),
      new Uint8Array(sig),
      new Uint8Array(pubKey),
    );
  } catch {
    return false;
  }
}

// ─── On-chain verification — Solana ──────────────────────────────────────────

interface SolanaSignature {
  signature: string;
  blockTime: number | null;
}

/**
 * Fetch up to `limit` signatures for a Solana address, newest first.
 * Uses pagination (before param) when limit > 1000.
 */
async function fetchSolanaSignatures(
  address: string,
  rpcUrl: string,
  maxSigs: number = 1000,
): Promise<SolanaSignature[]> {
  assertHttpsRpcUrl(rpcUrl, "SOLANA_RPC_URL");

  const results: SolanaSignature[] = [];
  let before: string | undefined = undefined;

  while (results.length < maxSigs) {
    const batchSize = Math.min(1000, maxSigs - results.length);
    const params: [string, Record<string, unknown>] = [
      address,
      { limit: batchSize, ...(before ? { before } : {}) },
    ];

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params }),
    });
    if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);

    const data = (await res.json()) as {
      result?: SolanaSignature[];
      error?: { message: string };
    };
    if (data.error) throw new Error(`Solana RPC: ${data.error.message}`);

    const batch = data.result ?? [];
    results.push(...batch);
    if (batch.length < batchSize) break;
    before = batch[batch.length - 1].signature;
  }

  return results;
}

async function getSolanaFirstActivityAgeMs(
  address: string,
  rpcUrl: string,
): Promise<number | null> {
  const sigs = await fetchSolanaSignatures(address, rpcUrl, 5000);
  if (sigs.length === 0) return null;
  const oldest = sigs[sigs.length - 1].blockTime;
  if (!oldest) return null;
  return Date.now() - oldest * 1000;
}

/**
 * Verify the wallet has on-chain activity in each of `REQUIRED_WINDOWS` rolling
 * 2-month windows covering the most recent 6 months.
 *
 * Windows (newest-first):
 *   [0–2 months ago], [2–4 months ago], [4–6 months ago]
 *
 * All three must contain at least 1 confirmed transaction.
 */
async function getSolanaThreeWindowActivity(
  address: string,
  rpcUrl: string,
): Promise<{ ok: boolean; failedWindow?: number }> {
  const now = Date.now();
  const sigs = await fetchSolanaSignatures(address, rpcUrl, 5000);

  const windows: [number, number][] = Array.from(
    { length: REQUIRED_WINDOWS },
    (_, i) => [now - (i + 1) * TWO_MONTHS_MS, now - i * TWO_MONTHS_MS],
  );

  for (let i = 0; i < windows.length; i++) {
    const [windowStart, windowEnd] = windows[i];
    const hasActivity = sigs.some((s) => {
      if (!s.blockTime) return false;
      const ts = s.blockTime * 1000;
      return ts >= windowStart && ts < windowEnd;
    });
    if (!hasActivity) return { ok: false, failedWindow: i };
  }

  return { ok: true };
}

// ─── On-chain verification — Monad / EVM ─────────────────────────────────────

async function evmJsonRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  assertHttpsRpcUrl(rpcUrl, "MONAD_RPC_URL");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`EVM RPC HTTP ${res.status}`);
  const data = (await res.json()) as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(`EVM RPC: ${data.error.message}`);
  return data.result as T;
}

/**
 * Binary-search the EVM chain to estimate the block number of the wallet's
 * first transaction by finding the lowest block where nonce >= 1.
 *
 * Returns the timestamp of that block in ms, or null when the wallet has no
 * transactions (REJECTED_NOT_FOUND).
 *
 * Accuracy: ±1 block. An indexer API gives exact results, but this approach
 * works with any standard JSON-RPC endpoint without additional dependencies.
 */
async function getEvmFirstTxAgeMs(
  address: string,
  rpcUrl: string,
): Promise<number | null> {
  const currentCountHex = await evmJsonRpc<string>(rpcUrl, "eth_getTransactionCount", [address, "latest"]);
  const currentCount = parseInt(currentCountHex, 16);
  if (currentCount === 0) return null;

  const latestBlockHex = await evmJsonRpc<string>(rpcUrl, "eth_blockNumber", []);
  let lo = 0;
  let hi = parseInt(latestBlockHex, 16);

  // Binary search: find the lowest block where tx count >= 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midCountHex = await evmJsonRpc<string>(
      rpcUrl,
      "eth_getTransactionCount",
      [address, `0x${mid.toString(16)}`],
    );
    const midCount = parseInt(midCountHex, 16);
    if (midCount >= 1) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  const block = await evmJsonRpc<{ timestamp?: string }>(
    rpcUrl,
    "eth_getBlockByNumber",
    [`0x${lo.toString(16)}`, false],
  );
  if (!block?.timestamp) return null;

  return Date.now() - parseInt(block.timestamp, 16) * 1000;
}

/**
 * Verify the EVM wallet has on-chain activity in each of `REQUIRED_WINDOWS`
 * rolling 2-month windows covering the most recent 6 months.
 *
 * Windows (newest-first):
 *   [0–2 months ago], [2–4 months ago], [4–6 months ago]
 *
 * Strategy: estimate the block number at each 2-month boundary using the
 * average block time, then compare tx nonces across boundaries.
 * All three windows must show ≥1 outgoing transaction.
 *
 * @param avgBlockTimeSec — Monad target is ~2s; adjust per chain.
 */
async function getEvmThreeWindowActivity(
  address: string,
  rpcUrl: string,
  avgBlockTimeSec: number = 2,
): Promise<{ ok: boolean; failedWindow?: number }> {
  const latestBlockHex = await evmJsonRpc<string>(rpcUrl, "eth_blockNumber", []);
  const latestBlock = parseInt(latestBlockHex, 16);

  const blocksPerWindow = Math.floor(TWO_MONTHS_MS / 1000 / avgBlockTimeSec);

  // Fetch tx counts at each window boundary in parallel
  const boundaryBlocks: number[] = Array.from(
    { length: REQUIRED_WINDOWS + 1 },
    (_, i) => Math.max(0, latestBlock - i * blocksPerWindow),
  );

  const counts = await Promise.all(
    boundaryBlocks.map((block) =>
      evmJsonRpc<string>(
        rpcUrl,
        "eth_getTransactionCount",
        [address, `0x${block.toString(16)}`],
      ).then((hex) => parseInt(hex, 16)),
    ),
  );

  // Window i spans [counts[i+1], counts[i]]; must have strictly increased
  for (let i = 0; i < REQUIRED_WINDOWS; i++) {
    if (counts[i] <= counts[i + 1]) {
      return { ok: false, failedWindow: i };
    }
  }

  return { ok: true };
}

// ─── Core on-chain eligibility check ─────────────────────────────────────────

/**
 * Runs on-chain eligibility checks for a node.
 *
 * Rejection codes:
 *   REJECTED_NOT_FOUND   — wallet has no on-chain history
 *   REJECTED_TOO_NEW     — wallet created < 6 months ago
 *   REJECTED_INACTIVE    — wallet lacks activity across all 3 rolling 2-month windows (Solana)
 *                          or has no activity in last 30 days (Monad)
 *   REJECTED_RPC_ERROR   — RPC call failed (fail-closed)
 *
 * If the relevant RPC URL is not configured, the check is skipped with a warning.
 */
async function runOnChainChecks(
  node: WatchNode,
): Promise<{ passed: boolean; reason?: string }> {
  const rpcUrl = node.chain === "solana" ? SOLANA_RPC_URL : MONAD_RPC_URL;

  if (!rpcUrl) {
    logger.warn(
      { walletAddress: node.walletAddress, chain: node.chain },
      "watch: on-chain verification skipped — no RPC URL configured",
    );
    return { passed: true };
  }

  try {
    if (node.chain === "solana") {
      const ageMs = await getSolanaFirstActivityAgeMs(node.walletAddress, rpcUrl);
      if (ageMs === null) return { passed: false, reason: "REJECTED_NOT_FOUND" };
      if (ageMs < SIX_MONTHS_MS) return { passed: false, reason: "REJECTED_TOO_NEW" };

      const windowCheck = await getSolanaThreeWindowActivity(node.walletAddress, rpcUrl);
      if (!windowCheck.ok) return { passed: false, reason: "REJECTED_INACTIVE" };
    } else {
      // Monad / EVM — same 3-window sustained activity requirement as Solana
      const ageMs = await getEvmFirstTxAgeMs(node.walletAddress, rpcUrl);
      if (ageMs === null) return { passed: false, reason: "REJECTED_NOT_FOUND" };
      if (ageMs < SIX_MONTHS_MS) return { passed: false, reason: "REJECTED_TOO_NEW" };

      const windowCheck = await getEvmThreeWindowActivity(node.walletAddress, rpcUrl);
      if (!windowCheck.ok) return { passed: false, reason: "REJECTED_INACTIVE" };
    }
    return { passed: true };
  } catch (err) {
    logger.error(
      { err, walletAddress: node.walletAddress, chain: node.chain },
      "watch: on-chain RPC error — failing closed",
    );
    return { passed: false, reason: "REJECTED_RPC_ERROR" };
  }
}

// ─── Twitter follow check ─────────────────────────────────────────────────────

interface TwitterErrorBody {
  reason?: string;
  title?: string;
  detail?: string;
  errors?: Array<{ message?: string; code?: number }>;
  data?: Array<{ id: string; username: string }>;
}

/** Thrown when the Twitter app is not enrolled in a Project (HTTP 403 client-not-enrolled). */
class TwitterNotEnrolledError extends Error {
  constructor(detail?: string) {
    super(
      `Twitter API: app not attached to a Project — visit https://developer.twitter.com/en/portal/dashboard to fix. Detail: ${detail ?? "client-not-enrolled"}`,
    );
    this.name = "TwitterNotEnrolledError";
  }
}

/**
 * Parse a Twitter API v2 JSON response body and throw a typed error for
 * well-known failure modes before the caller inspects the payload.
 */
function assertTwitterResponse(status: number, body: TwitterErrorBody, label: string): void {
  if (status === 403 && body.reason === "client-not-enrolled") {
    throw new TwitterNotEnrolledError(body.detail);
  }
  if (!String(status).startsWith("2")) {
    const msg = body.detail ?? body.errors?.[0]?.message ?? `HTTP ${status}`;
    throw new Error(`${label}: ${msg}`);
  }
}

async function checkTwitterFollow(
  fromHandle: string,
  toHandle: string,
  bearerToken: string,
): Promise<boolean> {
  // Resolve user IDs
  const lookupRes = await fetch(
    `https://api.twitter.com/2/users/by?usernames=${fromHandle},${toHandle}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } },
  );
  const lookupBody = (await lookupRes.json()) as TwitterErrorBody;
  assertTwitterResponse(lookupRes.status, lookupBody, "Twitter user lookup");

  const users = (lookupBody.data as Array<{ id: string; username: string }>) || [];
  const fromUser = users.find(u => u.username.toLowerCase() === fromHandle.toLowerCase());
  const toUser   = users.find(u => u.username.toLowerCase() === toHandle.toLowerCase());

  // Distinguish between "the watcher's handle doesn't exist" (REJECTED_X_NOT_FOUND)
  // and "the target account (cooperanthllc/mprotocol) wasn't in the lookup response"
  // (treat as not following — the target account's existence is assumed operational).
  if (!fromUser) throw new XHandleNotFoundError(`X handle @${fromHandle} not found`);
  if (!toUser)   return false;

  // Check friendship: GET /2/users/:id/following (paginate if needed)
  const followRes = await fetch(
    `https://api.twitter.com/2/users/${fromUser.id}/following?max_results=1000&target_user_id=${toUser.id}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } },
  );
  const followBody = (await followRes.json()) as TwitterErrorBody;
  assertTwitterResponse(followRes.status, followBody, "Twitter following lookup");

  const followData = followBody as { data?: Array<{ id: string }> };
  return (followData.data || []).some(u => u.id === toUser.id);
}

/** Thrown when the watcher's own X handle cannot be found in the Twitter API. */
class XHandleNotFoundError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "XHandleNotFoundError";
  }
}

// ─── Verification pipeline ────────────────────────────────────────────────────

/**
 * Rejection codes:
 *   REJECTED_X_NOT_FOUND             — invalid X handle format
 *   REJECTED_NOT_FOLLOWING           — not following @cooperanthllc
 *   REJECTED_NOT_FOLLOWING_PROTOCOL  — not following @mprotocol (flag-gated)
 *   REJECTED_TWITTER_UNAVAILABLE     — Twitter API unreachable (fail-closed)
 *   REJECTED_NOT_FOUND               — wallet has no on-chain history
 *   REJECTED_TOO_NEW                 — wallet created < 6 months ago
 *   REJECTED_INACTIVE                — insufficient activity across rolling windows
 *   REJECTED_RPC_ERROR               — RPC call failed (fail-closed)
 */
async function runVerification(node: WatchNode): Promise<{ passed: boolean; reason?: string }> {
  if (!isValidXHandle(node.xHandle)) {
    return { passed: false, reason: "REJECTED_X_NOT_FOUND" };
  }

  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (bearerToken) {
    try {
      const followsCooperanth = await checkTwitterFollow(node.xHandle, "cooperanthllc", bearerToken);
      if (!followsCooperanth) return { passed: false, reason: "REJECTED_NOT_FOLLOWING" };

      if (serverFlags.mprotocolFollowCheckEnabled) {
        const followsMprotocol = await checkTwitterFollow(node.xHandle, "mprotocol", bearerToken);
        if (!followsMprotocol) return { passed: false, reason: "REJECTED_NOT_FOLLOWING_PROTOCOL" };
      }
    } catch (err) {
      // XHandleNotFoundError: the watcher supplied a handle that does not exist on X.
      if (err instanceof XHandleNotFoundError) {
        return { passed: false, reason: "REJECTED_X_NOT_FOUND" };
      }
      // TwitterNotEnrolledError: developer app not in a Project — operator config issue.
      if (err instanceof TwitterNotEnrolledError) {
        logger.error({ err }, "watch: TWITTER_BEARER_TOKEN app is not enrolled in a Twitter Project — attach the app to a Project at https://developer.twitter.com/en/portal/dashboard");
        return { passed: false, reason: "REJECTED_TWITTER_UNAVAILABLE" };
      }
      // All other errors: Twitter API unreachable — fail closed per security policy.
      logger.error({ err }, "watch: Twitter API error — failing closed");
      return { passed: false, reason: "REJECTED_TWITTER_UNAVAILABLE" };
    }
  } else {
    // No bearer token — fail closed in production; use sentinels only in development.
    if (process.env.NODE_ENV === "production") {
      logger.error("watch: TWITTER_BEARER_TOKEN is not set in production — failing closed");
      return { passed: false, reason: "REJECTED_TWITTER_UNAVAILABLE" };
    }
    // Development-only simulation sentinels
    if (node.xHandle.toLowerCase() === "invalid") {
      return { passed: false, reason: "REJECTED_NOT_FOLLOWING" };
    }
    if (serverFlags.mprotocolFollowCheckEnabled && node.xHandle.toLowerCase() === "noprotocol") {
      return { passed: false, reason: "REJECTED_NOT_FOLLOWING_PROTOCOL" };
    }
  }

  const walletValid =
    node.chain === "solana"
      ? isSolanaAddress(node.walletAddress)
      : isMonadAddress(node.walletAddress);

  if (!walletValid) return { passed: false, reason: "REJECTED_NOT_FOUND" };

  return runOnChainChecks(node);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function getUptimeSeconds(node: WatchNode): number {
  return Math.floor((Date.now() - node.uptimeStart) / 1000);
}

function getEstimatedRewards(node: WatchNode): number {
  const hoursActive = getUptimeSeconds(node) / 3600;
  const baseRate = 0.5; // 0.5 MSL/hour base
  return Math.floor(hoursActive * baseRate * node.tier * 10) / 10;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /watch/app-config
 *
 * Returns minimum required app version for startup integrity enforcement.
 * The mobile client fetches this on launch and refuses to operate if its
 * compiled APP_VERSION is below minAppVersion (forced-update gate).
 * No authentication required — it is safe to expose publicly.
 */
router.get("/app-config", (_req, res) => {
  return res.json({
    minAppVersion: 1,
    currentAppVersion: 1,
    features: {
      mprotocolFollowCheckEnabled: serverFlags.mprotocolFollowCheckEnabled,
    },
  });
});

/**
 * POST /watch/admin/token
 *
 * Exchange the admin password for a short-lived HMAC session token (1h TTL).
 * The password is entered at runtime by the operator — it is NEVER bundled in
 * frontend JS (no VITE_ env var), so the secret is never exposed in browser
 * source bundles. The returned token is stored in sessionStorage by the admin
 * UI and sent as "Authorization: Bearer <token>" on subsequent requests.
 *
 * The same brute-force lockout that protects x-admin-secret also covers token
 * issuance, preventing offline dictionary attacks.
 */
router.post("/admin/token", (req, res) => {
  const ip = getClientIp(req);
  const attempt = adminAttempts.get(ip) ?? { failures: [], lockedUntil: 0 };
  if (Date.now() < attempt.lockedUntil) {
    const remaining = Math.ceil((attempt.lockedUntil - Date.now()) / 60_000);
    audit("admin_brute_force_blocked", ip, undefined, `token login locked for ${remaining}min`);
    return res.status(429).json({ error: `Locked. Try again in ${remaining} minutes.` });
  }

  const { password } = req.body as { password?: string };
  if (!password || password !== ADMIN_SECRET) {
    const now = Date.now();
    const recent = attempt.failures.filter(t => now - t < ADMIN_FAILURE_WINDOW_MS);
    recent.push(now);
    const lockedUntil = recent.length >= ADMIN_MAX_FAILURES ? now + ADMIN_LOCKOUT_MS : 0;
    adminAttempts.set(ip, { failures: recent, lockedUntil });
    if (lockedUntil) {
      logger.warn({ ip }, "watch: admin IP locked out after repeated token login failures");
      audit("admin_locked_out", ip, undefined, `${recent.length} token login failures`);
    } else {
      audit("admin_auth_fail", ip, undefined, `token login attempt ${recent.length}/${ADMIN_MAX_FAILURES}`);
    }
    return res.status(401).json({ error: "Invalid password." });
  }

  adminAttempts.set(ip, { failures: [], lockedUntil: 0 });
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL;
  const mac = createHmac("sha256", ADMIN_SECRET)
    .update(`admin:${expiresAt}`)
    .digest("hex");
  return res.json({ token: `${expiresAt}:${mac}`, expiresAt });
});

router.put("/flags", (req, res) => {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = req.body as Partial<typeof serverFlags>;
  const ip = getClientIp(req);
  if (typeof body.monadWalletEnabled === "boolean") {
    serverFlags.monadWalletEnabled = body.monadWalletEnabled;
    audit("admin_flag_updated", ip, undefined, `monadWalletEnabled=${body.monadWalletEnabled}`);
  }
  if (typeof body.neighborhoodWatchEnabled === "boolean") {
    serverFlags.neighborhoodWatchEnabled = body.neighborhoodWatchEnabled;
    audit("admin_flag_updated", ip, undefined, `neighborhoodWatchEnabled=${body.neighborhoodWatchEnabled}`);
  }
  if (typeof body.mslTokenAddressSolana === "string") {
    serverFlags.mslTokenAddressSolana = body.mslTokenAddressSolana;
    audit("admin_flag_updated", ip, undefined, `mslTokenAddressSolana updated`);
  }
  if (typeof body.mslTokenAddressMonad === "string") {
    serverFlags.mslTokenAddressMonad = body.mslTokenAddressMonad;
    audit("admin_flag_updated", ip, undefined, `mslTokenAddressMonad updated`);
  }
  if (typeof body.mprotocolFollowCheckEnabled === "boolean") {
    serverFlags.mprotocolFollowCheckEnabled = body.mprotocolFollowCheckEnabled;
    audit("admin_flag_updated", ip, undefined, `mprotocolFollowCheckEnabled=${body.mprotocolFollowCheckEnabled}`);
  }
  return res.json({ success: true, flags: { ...serverFlags } });
});

router.get("/flags", (req, res) => {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  return res.json({ flags: { ...serverFlags } });
});

router.get("/public-flags", (_req, res) => {
  return res.json({
    monadWalletEnabled:       serverFlags.monadWalletEnabled,
    neighborhoodWatchEnabled: serverFlags.neighborhoodWatchEnabled,
    mslTokenAddressSolana:    serverFlags.mslTokenAddressSolana,
    mslTokenAddressMonad:     serverFlags.mslTokenAddressMonad,
  });
});

/**
 * POST /watch/register
 * Rate limited: 5 per IP per hour.
 */
router.post("/register", registerLimiter, async (req, res) => {
  const ip = getClientIp(req);
  try {
    const { walletAddress, chain, xHandle, telegramHandle, discordHandle, devicePublicKey } =
      req.body as Record<string, string>;

    if (!walletAddress || !chain || !xHandle || !telegramHandle || !discordHandle || !devicePublicKey) {
      audit("register_rejected", ip, walletAddress, "missing fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["solana", "monad"].includes(chain)) {
      return res.status(400).json({ error: "Invalid chain. Must be 'solana' or 'monad'" });
    }

    if (!/^[0-9a-f]{64}$/i.test(devicePublicKey)) {
      audit("register_rejected", ip, walletAddress, "invalid devicePublicKey format");
      return res.status(400).json({ error: "devicePublicKey must be a 64-char hex Ed25519 public key" });
    }

    const walletValid = chain === "solana" ? isSolanaAddress(walletAddress) : isMonadAddress(walletAddress);
    if (!walletValid) {
      audit("register_rejected", ip, walletAddress, "invalid wallet address format");
      return res.status(400).json({ error: "Invalid wallet address format for selected chain" });
    }

    const [existing] = await db.select().from(watchNodes).where(eq(watchNodes.walletAddress, walletAddress));
    if (existing && existing.status === "ACTIVE") {
      audit("register_rejected", ip, walletAddress, "node already active");
      return res.status(409).json({ error: "Node already active. Use resubmit flow." });
    }

    const now = new Date();
    const verificationDue = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const nextRecheckAt   = new Date(verificationDue.getTime() + THIRTY_DAYS_MS);

    await db.insert(watchNodes).values({
      walletAddress, chain, xHandle: xHandle.replace(/^@/, ""),
      telegramHandle: telegramHandle.replace(/^@/, ""),
      discordHandle, devicePublicKey, status: "PENDING", tier: 1,
      verificationDue, nextRecheckAt, reportCount: 0, lockerCount: 0, consecutiveFailedChecks: 0,
    }).onConflictDoUpdate({
      target: watchNodes.walletAddress,
      set: {
        chain, xHandle: xHandle.replace(/^@/, ""), telegramHandle: telegramHandle.replace(/^@/, ""),
        discordHandle, devicePublicKey, status: "PENDING", rejectionReason: null,
        verificationDue, uptimeStart: now, nextRecheckAt,
        reportCount: 0, lockerCount: 0, consecutiveFailedChecks: 0, updatedAt: now,
      },
    });

    audit("register_ok", ip, walletAddress, chain);
    req.log.info({ walletAddress, chain }, "watch: node registered");

    return res.status(201).json({
      registeredAt: now,
      verificationDue,
      message: "Node registered. Verification will run at 48 hours.",
    });
  } catch (err) {
    req.log.error({ err }, "watch: registration error");
    audit("register_error", ip, req.body?.walletAddress as string | undefined, String(err));
    return res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * GET /watch/status/:address
 * Rate limited: 120 per IP per minute.
 * Triggers lazy verification for PENDING/ACTIVE nodes that are due.
 */
router.get("/status/:address", statusLimiter, async (req, res) => {
  try {
    const address = String(req.params.address);
    const [node] = await db.select().from(watchNodes).where(eq(watchNodes.walletAddress, address));
    if (!node) return res.status(404).json({ error: "Node not found" });

    const now = Date.now();

    if (node.status === "PENDING" && now >= node.verificationDue) {
      const result = await runVerification(node);
      if (result.passed) {
        await db.update(watchNodes).set({
          status: "ACTIVE", consecutiveFailedChecks: 0,
          nextRecheckAt: new Date(now.getTime() + THIRTY_DAYS_MS), updatedAt: now,
        }).where(eq(watchNodes.walletAddress, address));
        audit("node_activated", getClientIp(req), address);
      } else {
        await db.update(watchNodes).set({
          status: "REJECTED", rejectionReason: result.reason, updatedAt: now,
        }).where(eq(watchNodes.walletAddress, address));
        audit("node_rejected", getClientIp(req), address, result.reason);
      }
    }

    if (node.status === "ACTIVE" && now >= node.nextRecheckAt) {
      const result = await runVerification(node);
      if (!result.passed) {
        const newFails = node.consecutiveFailedChecks + 1;
        if (newFails >= 2) {
          await db.update(watchNodes).set({
            status: "DEACTIVATED", rejectionReason: result.reason,
            consecutiveFailedChecks: newFails, updatedAt: now,
          }).where(eq(watchNodes.walletAddress, address));
          audit("node_deactivated", getClientIp(req), address, result.reason);
        } else {
          await db.update(watchNodes).set({
            consecutiveFailedChecks: newFails,
            nextRecheckAt: new Date(now.getTime() + THIRTY_DAYS_MS), updatedAt: now,
          }).where(eq(watchNodes.walletAddress, address));
          audit("recheck_warning", getClientIp(req), address, `fail ${newFails}/2`);
        }
      } else {
        await db.update(watchNodes).set({
          consecutiveFailedChecks: 0,
          nextRecheckAt: new Date(now.getTime() + THIRTY_DAYS_MS), updatedAt: now,
        }).where(eq(watchNodes.walletAddress, address));
        audit("recheck_passed", getClientIp(req), address);
      }
      // Schedule next check regardless of pass/fail (if still active)
      if (node.status === "ACTIVE") {
        node.nextRecheckAt = now + THIRTY_DAYS_MS;
      }
    }

    const [fresh] = await db.select().from(watchNodes).where(eq(watchNodes.walletAddress, address));

    return res.json({
      status: fresh.status, tier: fresh.tier, rejectionReason: fresh.rejectionReason,
      verificationDue: fresh.verificationDue.getTime(), registeredAt: fresh.registeredAt.getTime(),
      nextRecheckAt: fresh.nextRecheckAt.getTime(), uptimeSeconds: getUptimeSeconds(fresh),
      reportCount: fresh.reportCount, lockerCount: fresh.lockerCount,
      estimatedRewards: getEstimatedRewards(fresh),
      onChainPingCount: fresh.onChainPingCount,
      xHandle: fresh.xHandle, telegramHandle: fresh.telegramHandle,
      discordHandle: fresh.discordHandle, chain: fresh.chain,
    });
  } catch (err) {
    req.log.error({ err }, "watch: status error");
    return res.status(500).json({ error: "Failed to fetch status" });
  }
});

/**
 * GET /watch/device/challenge?wallet=<address>
 * Issues a one-time nonce for authenticated device key rotation.
 */
router.get("/device/challenge", async (req, res) => {
  const wallet = String(req.query.wallet ?? "");
  if (!wallet) return res.status(400).json({ error: "wallet query param required" });

  const [node] = await db.select({ walletAddress: watchNodes.walletAddress })
    .from(watchNodes).where(eq(watchNodes.walletAddress, wallet));
  if (!node) return res.status(404).json({ error: "Node not found" });

  const nonce     = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ROTATION_CHALLENGE_TTL;
  rotationChallenges.set(wallet, { nonce, expiresAt });

  return res.json({ challenge: nonce, expiresAt });
});

/**
 * POST /watch/device
 * Rotate device Ed25519 public key with proof of ownership.
 *
 * Body: { walletAddress, newPublicKey, challenge, rotationSignature }
 * rotationSignature = Ed25519_sign("rotate:<challenge>:<newPublicKey>", OLD_SK)
 */
router.post("/device", async (req, res) => {
  const ip = getClientIp(req);
  try {
    const { walletAddress, newPublicKey, challenge, rotationSignature } =
      req.body as Record<string, string>;

    if (!walletAddress || !newPublicKey || !challenge || !rotationSignature) {
      return res.status(400).json({ error: "Required: walletAddress, newPublicKey, challenge, rotationSignature" });
    }

    if (!/^[0-9a-f]{64}$/i.test(newPublicKey)) {
      return res.status(400).json({ error: "newPublicKey must be a 64-char hex Ed25519 public key" });
    }

    const [node] = await db.select().from(watchNodes).where(eq(watchNodes.walletAddress, walletAddress));
    if (!node) return res.status(404).json({ error: "Node not found" });

    const stored = rotationChallenges.get(walletAddress);
    if (!stored || stored.nonce !== challenge) {
      audit("device_rotation_bad_challenge", ip, walletAddress);
      return res.status(400).json({ error: "Invalid or expired challenge. Request a new one." });
    }

    if (Date.now() > stored.expiresAt) {
      rotationChallenges.delete(walletAddress);
      audit("device_rotation_expired", ip, walletAddress);
      return res.status(400).json({ error: "Challenge expired. Request a new one." });
    }

    const valid = verifyRotationSignature(node.devicePublicKey, challenge, newPublicKey, rotationSignature);
    if (!valid) {
      audit("device_rotation_bad_sig", ip, walletAddress);
      return res.status(403).json({ error: "Invalid rotation signature — proof of ownership required" });
    }

    rotationChallenges.delete(walletAddress);
    await db.update(watchNodes).set({ devicePublicKey: newPublicKey, updatedAt: new Date() })
      .where(eq(watchNodes.walletAddress, walletAddress));

    audit("device_key_rotated", ip, walletAddress);
    req.log.info({ walletAddress }, "watch: device key rotated");
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "watch: device rotation error");
    return res.status(500).json({ error: "Failed to rotate device key" });
  }
});

/**
 * POST /watch/ping
 * Rate limited: 1 per wallet per 4 minutes.
 *
 * Records a heartbeat timestamp from an ACTIVE Tier 1 Community Node. Pings
 * accumulate in-memory and are flushed to NeighborhoodWatch.vy on-chain by
 * the oracle batch worker every 5 minutes.
 *
 * Security: requires an Ed25519 signature over the canonical message
 *   ping:<walletAddress>:<timestamp>
 * using the device key registered for this node. This prevents any actor from
 * spoofing pings for another wallet's node and inflating uptime credits.
 *
 * Body: { walletAddress, timestamp, signature }
 *   timestamp: ms since epoch (must be within ±60s of server time)
 *   signature: 128-char hex Ed25519 detached sig of canonical message
 */
router.post("/ping", pingLimiter, async (req, res) => {
  const ip = getClientIp(req);
  try {
    const { walletAddress, timestamp, signature } =
      req.body as { walletAddress: string; timestamp: number; signature: string };

    if (!walletAddress || !timestamp || !signature) {
      return res.status(400).json({ error: "walletAddress, timestamp, and signature are required" });
    }

    if (typeof signature !== "string" || signature.length !== 128) {
      return res.status(400).json({ error: "signature must be a 128-char hex Ed25519 signature" });
    }

    const now = Date.now();
    if (Math.abs(now - timestamp) > 60_000) {
      audit("ping_stale_timestamp", ip, walletAddress, `delta=${Math.abs(now - timestamp)}ms`);
      return res.status(400).json({ error: "Ping timestamp expired (must be within ±60s)" });
    }

    const [node] = await db.select({
      walletAddress: watchNodes.walletAddress,
      status: watchNodes.status,
      tier: watchNodes.tier,
      devicePublicKey: watchNodes.devicePublicKey,
    }).from(watchNodes).where(eq(watchNodes.walletAddress, walletAddress));

    if (!node) {
      return res.status(404).json({ error: "Node not found" });
    }
    if (node.status !== "ACTIVE") {
      audit("ping_inactive_node", ip, walletAddress, node.status);
      return res.status(403).json({ error: "Only ACTIVE nodes can submit pings" });
    }
    if (node.tier !== 1) {
      return res.status(403).json({ error: "ping batching is for Tier 1 nodes only; Tier 2+ call ping() directly on-chain" });
    }

    // Verify Ed25519 signature: canonical message is "ping:<wallet>:<timestamp>"
    const canonical = `ping:${walletAddress}:${timestamp}`;
    let sigValid = false;
    try {
      const msg    = Buffer.from(canonical, "utf8");
      const sig    = Buffer.from(signature, "hex");
      const pubKey = Buffer.from(node.devicePublicKey, "hex");
      sigValid = nacl.sign.detached.verify(
        new Uint8Array(msg),
        new Uint8Array(sig),
        new Uint8Array(pubKey),
      );
    } catch {
      sigValid = false;
    }

    if (!sigValid) {
      audit("ping_bad_signature", ip, walletAddress);
      return res.status(403).json({ error: "Invalid ping signature" });
    }

    const existing = pingBuffer.get(walletAddress) ?? [];
    existing.push(timestamp);
    // Compact: keep only the newest PING_BUFFER_MAX_PER_WALLET entries
    const bounded = existing.length > PING_BUFFER_MAX_PER_WALLET
      ? existing.slice(-PING_BUFFER_MAX_PER_WALLET)
      : existing;
    pingBuffer.set(walletAddress, bounded);

    audit("ping_queued", ip, walletAddress, `buffer=${bounded.length}`);
    return res.json({ queued: true, pendingPings: bounded.length });
  } catch (err) {
    req.log.error({ err }, "watch: ping error");
    return res.status(500).json({ error: "Failed to record ping" });
  }
});

/**
 * GET /watch/ping-stats/:address
 * Returns on-chain ping count and current buffer depth for a node.
 */
router.get("/ping-stats/:address", async (req, res) => {
  try {
    const address = String(req.params.address);
    const [node] = await db.select({ onChainPingCount: watchNodes.onChainPingCount })
      .from(watchNodes).where(eq(watchNodes.walletAddress, address));
    if (!node) return res.status(404).json({ error: "Node not found" });

    const pendingPings = pingBuffer.get(address)?.length ?? 0;
    return res.json({ onChainPingCount: node.onChainPingCount, pendingPings });
  } catch (err) {
    req.log.error({ err }, "watch: ping-stats error");
    return res.status(500).json({ error: "Failed to fetch ping stats" });
  }
});

/**
 * POST /watch/report
 * Rate limited: 200 per IP per 15 min.
 *
 * Security (in order):
 *  1. Node must exist and be ACTIVE
 *  2. Ed25519 signature verification
 *  3. Timestamp freshness (±60s)
 *  4. Nonce uniqueness (DB-backed replay prevention)
 *  5. Per-locker rate limit (10 reports/hour)
 */
router.post("/report", reportLimiter, async (req, res) => {
  const ip = getClientIp(req);
  try {
    const { walletAddress, lockerAddress, alertType, severity, nonce, timestamp, signature } =
      req.body as {
        walletAddress: string; lockerAddress: string; alertType: string;
        severity: number; nonce: string; timestamp: number; signature: string;
      };

    if (!walletAddress || !lockerAddress || !alertType || !nonce || !timestamp || !signature) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [node] = await db.select().from(watchNodes).where(eq(watchNodes.walletAddress, walletAddress));
    if (!node) {
      audit("report_unknown_node", ip, walletAddress);
      return res.status(404).json({ error: "Node not found" });
    }

    if (node.status !== "ACTIVE") {
      audit("report_inactive_node", ip, walletAddress, node.status);
      return res.status(403).json({ error: "Node must be ACTIVE to submit reports" });
    }

    const sigValid = verifyReportSignature(
      node.devicePublicKey, walletAddress, lockerAddress, alertType, severity, nonce, timestamp, signature,
    );
    if (!sigValid) {
      audit("report_bad_signature", ip, walletAddress);
      return res.status(403).json({ error: "Invalid report signature" });
    }

    const now = Date.now();
    if (Math.abs(now - timestamp) > 60_000) {
      audit("report_stale_timestamp", ip, walletAddress, `delta=${Math.abs(now - timestamp)}ms`);
      return res.status(400).json({ error: "Report timestamp expired" });
    }

    // Nonce replay prevention
    const nonceExpiry = new Date(now - NONCE_TTL_MS);
    await db.delete(watchNonces).where(
      and(eq(watchNonces.walletAddress, walletAddress), lt(watchNonces.createdAt, nonceExpiry)),
    );
    try {
      await db.insert(watchNonces).values({ walletAddress, nonce });
    } catch {
      audit("report_replay_blocked", ip, walletAddress, nonce);
      return res.status(400).json({ error: "Duplicate nonce — possible replay attack" });
    }

    // Per-locker rate limit
    const oneHourAgo = new Date(now - 3_600_000);
    const recentReports = await db.select({ count: sql<number>`count(*)::int` })
      .from(watchReports)
      .where(and(
        eq(watchReports.walletAddress, walletAddress),
        eq(watchReports.lockerAddress, lockerAddress),
        gt(watchReports.createdAt, oneHourAgo),
      ));

    if ((recentReports[0]?.count ?? 0) >= 10) {
      audit("report_locker_rate_limited", ip, walletAddress, lockerAddress);
      return res.status(429).json({ error: "Rate limit exceeded: max 10 reports per locker per hour" });
    }

    await db.insert(watchReports).values({
      walletAddress, lockerAddress, alertType, severity: severity ?? 1, nonce,
    });

    const distinctLockers = await db.select({ lockerAddress: watchReports.lockerAddress })
      .from(watchReports).where(eq(watchReports.walletAddress, walletAddress))
      .groupBy(watchReports.lockerAddress);

    await db.update(watchNodes).set({
      reportCount: sql`${watchNodes.reportCount} + 1`,
      lockerCount: distinctLockers.length, updatedAt: new Date(),
    }).where(eq(watchNodes.walletAddress, walletAddress));

    const [updated] = await db.select().from(watchNodes).where(eq(watchNodes.walletAddress, walletAddress));

    audit("report_accepted", ip, walletAddress, `${alertType} sev=${severity}`);
    req.log.info({ walletAddress, lockerAddress, alertType, severity }, "watch: report accepted");

    return res.json({ success: true, reportCount: updated.reportCount, credits: getEstimatedRewards(updated) });
  } catch (err) {
    req.log.error({ err }, "watch: report error");
    return res.status(500).json({ error: "Report submission failed" });
  }
});

/**
 * GET /watch/nodes
 * Admin-only: list all nodes.
 */
router.get("/nodes", async (req, res) => {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const nodes = await db.select().from(watchNodes);
    const summary = nodes.map(n => ({
      walletAddress: n.walletAddress, chain: n.chain, xHandle: n.xHandle,
      status: n.status, tier: n.tier, registeredAt: n.registeredAt.getTime(),
      verificationDue: n.verificationDue.getTime(), nextRecheckAt: n.nextRecheckAt.getTime(),
      reportCount: n.reportCount, lockerCount: n.lockerCount,
      uptimeSeconds: getUptimeSeconds(n), rejectionReason: n.rejectionReason,
    }));

    return res.json({
      total: summary.length,
      active: summary.filter(n => n.status === "ACTIVE").length,
      pending: summary.filter(n => n.status === "PENDING").length,
      rejected: summary.filter(n => n.status === "REJECTED").length,
      flags: { ...serverFlags },
      nodes: summary,
    });
  } catch (err) {
    req.log.error({ err }, "watch: nodes list error");
    return res.status(500).json({ error: "Failed to list nodes" });
  }
});

// ─── On-chain activity derivation ────────────────────────────────────────────

interface ServerObservation {
  id: string;
  type: string;
  lockerId: string;
  timestamp: number;
  severity: number;
}

// Solana SPL Token Program address (canonical constant)
const SOLANA_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Monitor a single Solana protocol locker account for anomalies.
 *
 * A "locker" is a protocol program account (identified by its base58 address
 * stored as externalId in the lockers table). Watcher nodes monitor these
 * accounts — not their own wallets — for suspicious activity.
 *
 * Checks performed (read-only Solana JSON-RPC):
 *   getSignaturesForAddress → AUTH_FAILURES (failed txs on locker) 
 *   getBalance              → LARGE_OUTFLOW when locker balance drops sharply
 *   getTransaction          → NFT_TRANSFER / UNUSUAL_PATTERN on the locker
 *
 * Returns [] when the locker address is not a valid Solana account or the
 * RPC call fails.
 */
async function monitorSolanaLocker(
  lockerAddress: string,
  rpcUrl: string,
): Promise<ServerObservation[]> {
  const observations: ServerObservation[] = [];
  const idPrefix = lockerAddress.slice(-8);

  // 1. Recent signatures on the locker account
  const sigsRes = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
      params: [lockerAddress, { limit: 20 }],
    }),
  });
  if (!sigsRes.ok) return [];

  const sigsData = (await sigsRes.json()) as {
    result?: Array<{ signature: string; blockTime: number | null; err: unknown }>;
  };
  const sigs = sigsData.result ?? [];
  const failedSigs = sigs.filter((s) => s.err !== null);

  // AUTH_FAILURES: failed transactions on a locker account indicate
  // unauthorized access attempts (e.g. someone trying to withdraw without authority).
  if (failedSigs.length >= 2) {
    const latestFailed = failedSigs[0];
    observations.push({
      id: `auth_${idPrefix}_${latestFailed.signature.slice(0, 8)}`,
      type: "AUTH_FAILURES",
      lockerId: lockerAddress,
      timestamp: (latestFailed.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
      severity: failedSigs.length >= 5 ? 3 : 2,
    });
  }

  // 2. Check the most recent successful transaction for large balance changes
  const successfulSig = sigs.find((s) => s.err === null);
  if (successfulSig) {
    const txRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "getTransaction",
        params: [successfulSig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    });
    if (txRes.ok) {
      const txData = (await txRes.json()) as {
        result?: {
          meta?: { preBalances?: number[]; postBalances?: number[] };
          transaction?: {
            message?: {
              accountKeys?: Array<{ pubkey?: string } | string>;
              instructions?: Array<{ programId?: string }>;
            };
          };
        };
      };
      const tx = txData.result;
      const ts = (successfulSig.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
      const sigSlug = successfulSig.signature.slice(0, 8);

      if (tx?.meta?.preBalances && tx.meta.postBalances && tx.transaction?.message?.accountKeys) {
        const accountKeys = tx.transaction.message.accountKeys.map((k) =>
          typeof k === "string" ? k : (k.pubkey ?? ""),
        );
        const lockerIdx = accountKeys.indexOf(lockerAddress);
        if (lockerIdx >= 0) {
          const deltaLamports =
            (tx.meta.preBalances[lockerIdx] ?? 0) - (tx.meta.postBalances[lockerIdx] ?? 0);
          const deltaSol = deltaLamports / 1e9;
          // LARGE_OUTFLOW: significant SOL leaving a protocol locker is high-severity
          if (deltaSol > 5) {
            observations.push({
              id: `outflow_${idPrefix}_${sigSlug}`,
              type: "LARGE_OUTFLOW",
              lockerId: lockerAddress,
              timestamp: ts,
              severity: deltaSol > 50 ? 3 : 2,
            });
          }
        }
      }

      const instructions = tx?.transaction?.message?.instructions ?? [];
      const programIds = instructions.map((ix) => ix.programId ?? "");

      // NFT_TRANSFER: SPL token program involvement on a locker account
      if (programIds.includes(SOLANA_TOKEN_PROGRAM)) {
        observations.push({
          id: `token_${idPrefix}_${sigSlug}`,
          type: "NFT_TRANSFER",
          lockerId: lockerAddress,
          timestamp: ts,
          severity: 1,
        });
      }

      // UNUSUAL_PATTERN: high instruction-count tx touching a locker (potential exploit attempt)
      if (instructions.length > 5) {
        observations.push({
          id: `unusual_${idPrefix}_${sigSlug}`,
          type: "UNUSUAL_PATTERN",
          lockerId: lockerAddress,
          timestamp: ts,
          severity: instructions.length > 10 ? 2 : 1,
        });
      }
    }
  }

  return observations;
}

/**
 * Derive typed anomaly observations for a Solana-chain watcher node.
 *
 * Monitoring scope:
 *   1. NODE_HEALTH_LOW  — watcher's own wallet balance (can the node pay gas?)
 *   2. Locker anomalies — read-only monitoring of protocol locker accounts
 *      assigned to this watcher's tier. The lockerId in each observation is
 *      the actual Solana locker account address (externalId in the DB).
 *
 * Uses only read-only Solana JSON-RPC methods (getBalance, getSignaturesForAddress,
 * getTransaction). No write operations or private key material involved.
 */
async function deriveObservationsSolana(
  walletAddress: string,
  rpcUrl: string,
  nodeTier: number,
): Promise<ServerObservation[]> {
  assertHttpsRpcUrl(rpcUrl, "SOLANA_RPC_URL");

  const observations: ServerObservation[] = [];
  const nodeIdPrefix = walletAddress.slice(-8);

  // 1. Node health: check the watcher's own wallet balance.
  //    A watcher with < 0.05 SOL cannot pay transaction fees and will be
  //    unable to submit reports — report this as NODE_HEALTH_LOW.
  const balRes = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [walletAddress] }),
  });
  if (balRes.ok) {
    const balData = (await balRes.json()) as { result?: { value?: number } };
    const lamports = balData.result?.value ?? 0;
    const solBalance = lamports / 1e9;
    if (solBalance < 0.05) {
      observations.push({
        id: `health_${nodeIdPrefix}_${Math.floor(Date.now() / 300_000)}`,
        type: "NODE_HEALTH_LOW",
        lockerId: `node:${walletAddress.slice(0, 8)}`, // "node:" prefix distinguishes from protocol lockers
        timestamp: Date.now(),
        severity: solBalance < 0.01 ? 3 : 2,
      });
    }
  }

  // 2. Protocol locker monitoring.
  //    Query the DB for lockers assigned to this tier and monitor their
  //    on-chain state. The externalId field stores the Solana account address.
  //    Limit to 5 lockers per check to bound RPC calls per invocation.
  const assignedLockers = await db
    .select({ externalId: lockers.externalId })
    .from(lockers)
    .where(eq(lockers.tier, nodeTier))
    .limit(5);

  const lockerObsArrays = await Promise.allSettled(
    assignedLockers
      .filter((l) => isSolanaAddress(l.externalId)) // only valid Solana addresses
      .map((l) => monitorSolanaLocker(l.externalId, rpcUrl)),
  );

  for (const result of lockerObsArrays) {
    if (result.status === "fulfilled") {
      observations.push(...result.value);
    }
  }

  return observations;
}

/**
 * Monitor a single Monad (EVM) protocol locker vault contract for anomalies.
 *
 * Checks (read-only EVM JSON-RPC):
 *   eth_getBalance         → large balance drop (LARGE_OUTFLOW)
 *   eth_getTransactionCount → high tx rate to vault (UNUSUAL_PATTERN / AUTH_FAILURES)
 */
async function monitorEvmLocker(
  lockerAddress: string,
  rpcUrl: string,
): Promise<ServerObservation[]> {
  const observations: ServerObservation[] = [];
  const idPrefix = lockerAddress.slice(-8);
  const windowId = Math.floor(Date.now() / 300_000);

  // Check vault balance
  const balanceHex = await evmJsonRpc<string>(rpcUrl, "eth_getBalance", [lockerAddress, "latest"]);
  const balanceEth = Number(BigInt(balanceHex)) / 1e18;

  // LARGE_OUTFLOW: vault with unexpectedly low balance
  if (balanceEth < 0.1) {
    observations.push({
      id: `vault_low_${idPrefix}_${windowId}`,
      type: "LARGE_OUTFLOW",
      lockerId: lockerAddress,
      timestamp: Date.now(),
      severity: balanceEth < 0.01 ? 3 : 2,
    });
  }

  // Check tx count increase over last ~50 blocks (high frequency = suspicious)
  const latestHex = await evmJsonRpc<string>(rpcUrl, "eth_blockNumber", []);
  const latest    = parseInt(latestHex, 16);
  const fromBlock = Math.max(0, latest - 50);

  const pastCountHex   = await evmJsonRpc<string>(rpcUrl, "eth_getTransactionCount", [lockerAddress, `0x${fromBlock.toString(16)}`]);
  const latestCountHex = await evmJsonRpc<string>(rpcUrl, "eth_getTransactionCount", [lockerAddress, "latest"]);
  const txDelta = parseInt(latestCountHex, 16) - parseInt(pastCountHex, 16);

  if (txDelta > 5) {
    observations.push({
      id: `burst_${idPrefix}_${fromBlock}`,
      type: txDelta > 20 ? "AUTH_FAILURES" : "UNUSUAL_PATTERN",
      lockerId: lockerAddress,
      timestamp: Date.now(),
      severity: txDelta > 20 ? 3 : 2,
    });
  }

  return observations;
}

/**
 * Derive typed anomaly observations for a Monad-chain watcher node.
 *
 * Monitoring scope:
 *   1. NODE_HEALTH_LOW  — watcher's own wallet balance
 *   2. Locker/vault anomalies — monitor monadAddress of protocol lockers
 *      assigned to this tier. The lockerId in each observation is the actual
 *      Monad vault contract address (monadAddress in the DB).
 */
async function deriveObservationsMonad(
  walletAddress: string,
  rpcUrl: string,
  nodeTier: number,
): Promise<ServerObservation[]> {
  assertHttpsRpcUrl(rpcUrl, "MONAD_RPC_URL");

  const observations: ServerObservation[] = [];
  const nodeIdPrefix = walletAddress.slice(-8);

  // 1. Node health: check the watcher's own Monad wallet balance
  const balanceHex = await evmJsonRpc<string>(rpcUrl, "eth_getBalance", [walletAddress, "latest"]);
  const balanceEth = Number(BigInt(balanceHex)) / 1e18;
  if (balanceEth < 0.01) {
    observations.push({
      id: `health_${nodeIdPrefix}_${Math.floor(Date.now() / 300_000)}`,
      type: "NODE_HEALTH_LOW",
      lockerId: `node:${walletAddress.slice(0, 10)}`,
      timestamp: Date.now(),
      severity: balanceEth < 0.001 ? 3 : 2,
    });
  }

  // 2. Protocol vault monitoring — sample up to 5 Monad-chain lockers by tier
  const assignedLockers = await db
    .select({ monadAddress: lockers.monadAddress })
    .from(lockers)
    .where(eq(lockers.tier, nodeTier))
    .limit(5);

  const lockerObsArrays = await Promise.allSettled(
    assignedLockers
      .filter((l): l is { monadAddress: string } => Boolean(l.monadAddress) && isMonadAddress(l.monadAddress!))
      .map((l) => monitorEvmLocker(l.monadAddress, rpcUrl)),
  );

  for (const result of lockerObsArrays) {
    if (result.status === "fulfilled") {
      observations.push(...result.value);
    }
  }

  return observations;
}

/**
 * GET /watch/activity/:address
 *
 * Returns anomaly observations derived from real on-chain data for the wallet.
 * The server makes read-only RPC calls — no synthetic data is generated.
 *
 * Available for both PENDING and ACTIVE nodes so that the mobile client can
 * show a live monitoring feed during the 48h pending verification window.
 * PENDING observations are displayed locally only; the client does not submit
 * them as reports (only ACTIVE nodes may call POST /watch/report).
 *
 * Returns [] when the node is not found, is REJECTED/DEACTIVATED, or when
 * RPC URLs are not configured.
 *
 * Rate limited: 60 per IP per minute.
 */
const activityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler(_req, res) { res.status(429).json({ observations: [] }); },
});

router.get("/activity/:address", activityLimiter, async (req, res) => {
  try {
    const address = String(req.params.address);
    const [node] = await db.select().from(watchNodes).where(eq(watchNodes.walletAddress, address));

    // Only serve monitoring data for nodes that are in the monitoring funnel
    if (!node || !["PENDING", "ACTIVE"].includes(node.status)) {
      return res.json({ observations: [] });
    }

    const rpcUrl = node.chain === "solana" ? SOLANA_RPC_URL : MONAD_RPC_URL;
    if (!rpcUrl) {
      return res.json({ observations: [] });
    }

    const nodeTier = node.tier ?? 1;
    const observations = node.chain === "solana"
      ? await deriveObservationsSolana(address, rpcUrl, nodeTier)
      : await deriveObservationsMonad(address, rpcUrl, nodeTier);

    return res.json({ observations });
  } catch (err) {
    req.log.error({ err }, "watch: activity derivation error");
    return res.json({ observations: [] });
  }
});

/**
 * GET /watch/audit?limit=50
 * Admin-only: recent security audit log.
 */
router.get("/audit", async (req, res) => {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const entries = await db.select().from(watchAuditLog)
      .orderBy(desc(watchAuditLog.createdAt)).limit(limit);
    return res.json({ entries });
  } catch (err) {
    req.log.error({ err }, "watch: audit log fetch error");
    return res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// ─── On-chain ping batch worker ───────────────────────────────────────────────

/**
 * Oracle private key for submitting batched pings to NeighborhoodWatch.vy.
 *
 * When ORACLE_PRIVATE_KEY is set, the batch worker submits accumulated pings
 * to the contract on behalf of Tier 1 nodes via ping_for(watcher).
 * Without it, the worker logs what it would submit, re-queues fresh timestamps,
 * and does NOT increment onChainPingCount — the counter only reflects confirmed
 * on-chain events so it is never overstated in dry-run mode.
 */
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY ?? "";
const NEIGHBORHOOD_WATCH_CONTRACT = process.env.NEIGHBORHOOD_WATCH_CONTRACT ?? "";

/**
 * Submits a batch of ping timestamps for a single Tier 1 node to
 * NeighborhoodWatch.vy using the oracle wallet and the `ping_for(watcher)`
 * function. This correctly attributes uptime to the Tier 1 node's address,
 * not to the oracle wallet.
 *
 * Returns the number of pings confirmed on-chain (0 if unconfigured or failed).
 * Does NOT increment the counter in dry-run mode — the counter must only
 * reflect actual on-chain events to remain truthful.
 */
async function submitPingBatchOnChain(
  walletAddress: string,
  timestamps: number[],
): Promise<number> {
  if (!ORACLE_PRIVATE_KEY || !NEIGHBORHOOD_WATCH_CONTRACT || !MONAD_RPC_URL) {
    logger.info(
      {
        walletAddress,
        count: timestamps.length,
        contract: NEIGHBORHOOD_WATCH_CONTRACT || "(not set)",
        reason: "ORACLE_PRIVATE_KEY / NEIGHBORHOOD_WATCH_CONTRACT / MONAD_RPC_URL not configured",
      },
      "ping-batch: oracle not configured — skipping on-chain submission (set env vars to enable)",
    );
    return 0;
  }

  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
    const signer   = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);

    // Use ping_for(watcher) — oracle-authorized function that credits the
    // Tier 1 node's address (not msg.sender) in the contract's watcher map.
    // One tx per flush is sufficient; the API-side buffer is the audit trail.
    const abi = ["function ping_for(address _watcher) external"];
    const contract = new ethers.Contract(NEIGHBORHOOD_WATCH_CONTRACT, abi, signer);

    const tx = await contract.ping_for(walletAddress) as { hash: string; wait: () => Promise<unknown> };
    await tx.wait();

    logger.info(
      { walletAddress, bufferedCount: timestamps.length, txHash: tx.hash },
      "ping-batch: on-chain ping_for confirmed — crediting 1 on-chain ping",
    );
    // One tx = one on-chain heartbeat event, regardless of how many timestamps
    // were buffered in the flush window. The buffer is an activity audit trail;
    // the on-chain record is the confirmed WatcherPinged event.
    return 1;
  } catch (err) {
    logger.error({ err, walletAddress }, "ping-batch: on-chain submission failed");
    return 0;
  }
}

/**
 * Starts the ping batch worker. Runs every 5 minutes, drains the in-memory
 * ping buffer for all active Tier 1 nodes, submits pings to NeighborhoodWatch.vy
 * via the oracle wallet, and increments onChainPingCount in the DB.
 *
 * onChainPingCount is only incremented when a confirmed tx is received.
 * Failed submissions re-queue their timestamps to prevent data loss.
 *
 * Must be called once at server startup alongside startVerificationWorker().
 */
export function startPingBatchWorker(): void {
  const BATCH_INTERVAL = 5 * 60 * 1000;

  async function flushPingBuffer(): Promise<void> {
    if (pingBuffer.size === 0) return;

    const snapshot = new Map(pingBuffer);
    pingBuffer.clear();

    for (const [walletAddress, timestamps] of snapshot) {
      if (timestamps.length === 0) continue;
      let submitted = 0;
      try {
        submitted = await submitPingBatchOnChain(walletAddress, timestamps);
      } catch (err) {
        logger.error({ err, walletAddress }, "ping-batch: unexpected error during submission");
      }

      if (submitted > 0) {
        try {
          await db.update(watchNodes)
            .set({
              onChainPingCount: sql`${watchNodes.onChainPingCount} + ${submitted}`,
              updatedAt: new Date(),
            })
            .where(eq(watchNodes.walletAddress, walletAddress));
          audit("ping_batch_submitted", "oracle-worker", walletAddress, `onChainIncrement=${submitted}`);
        } catch (dbErr) {
          logger.error({ dbErr, walletAddress }, "ping-batch: DB update failed after on-chain success");
        }
      } else {
        // On-chain submission failed or oracle not configured.
        // Re-queue only timestamps that are still within the TTL window so the
        // buffer stays bounded even when the oracle is persistently down.
        const cutoff = Date.now() - PING_BUFFER_TTL_MS;
        const fresh  = timestamps.filter((t) => t > cutoff);
        if (fresh.length > 0) {
          const current = pingBuffer.get(walletAddress) ?? [];
          // Merge and keep newest PING_BUFFER_MAX_PER_WALLET entries
          const merged = [...fresh, ...current];
          pingBuffer.set(
            walletAddress,
            merged.length > PING_BUFFER_MAX_PER_WALLET
              ? merged.slice(-PING_BUFFER_MAX_PER_WALLET)
              : merged,
          );
          logger.info(
            { walletAddress, requeued: fresh.length, dropped: timestamps.length - fresh.length },
            "ping-batch: timestamps re-queued (oracle unavailable)",
          );
        } else {
          logger.info(
            { walletAddress, dropped: timestamps.length },
            "ping-batch: all timestamps expired (TTL), dropping",
          );
        }
      }
    }
  }

  setInterval(() => { flushPingBuffer().catch(() => {}); }, BATCH_INTERVAL);

  logger.info({ batchIntervalSec: BATCH_INTERVAL / 1000 }, "watch: ping batch worker started");
}

// ─── Background verification worker ──────────────────────────────────────────

/**
 * Starts three scheduled jobs:
 *  - Pending check (every 5 min): verifies PENDING nodes past their 48h window.
 *  - Active recheck (every 30 min): re-runs verification for ACTIVE nodes past nextRecheckAt.
 *  - Nonce cleanup (every 10 min): globally deletes watch_nonces rows older than the TTL
 *    window, ensuring the table stays bounded regardless of wallet activity.
 *
 * Runs in-process. Must be called once at server startup.
 */
export function startVerificationWorker(): void {
  const PENDING_INTERVAL       = 5  * 60 * 1000;
  const ACTIVE_INTERVAL        = 30 * 60 * 1000;
  const NONCE_CLEANUP_INTERVAL = 10 * 60 * 1000;

  async function processPendingNodes(): Promise<void> {
    const now = new Date();
    try {
      const pending = await db.select().from(watchNodes)
        .where(and(eq(watchNodes.status, "PENDING"), lte(watchNodes.verificationDue, now)));

      for (const node of pending) {
        try {
          const result = await runVerification(node);
          if (result.passed) {
            await db.update(watchNodes).set({
              status: "ACTIVE", consecutiveFailedChecks: 0,
              nextRecheckAt: new Date(now.getTime() + THIRTY_DAYS_MS), updatedAt: now,
            }).where(eq(watchNodes.walletAddress, node.walletAddress));
            audit("node_activated", "server-worker", node.walletAddress, "scheduled check");
            logger.info({ walletAddress: node.walletAddress }, "watch-worker: node activated");
          } else {
            await db.update(watchNodes).set({
              status: "REJECTED", rejectionReason: result.reason, updatedAt: now,
            }).where(eq(watchNodes.walletAddress, node.walletAddress));
            audit("node_rejected", "server-worker", node.walletAddress, result.reason);
            logger.info({ walletAddress: node.walletAddress, reason: result.reason }, "watch-worker: node rejected");
          }
        } catch (err) {
          logger.error({ err, walletAddress: node.walletAddress }, "watch-worker: error processing pending node");
        }
      }
    } catch (err) {
      logger.error({ err }, "watch-worker: failed to query pending nodes");
    }
  }

  async function processActiveNodes(): Promise<void> {
    const now = new Date();
    try {
      const due = await db.select().from(watchNodes)
        .where(and(eq(watchNodes.status, "ACTIVE"), lte(watchNodes.nextRecheckAt, now)));

      for (const node of due) {
        try {
          const result = await runVerification(node);
          if (!result.passed) {
            const newFails = node.consecutiveFailedChecks + 1;
            if (newFails >= 2) {
              await db.update(watchNodes).set({
                status: "DEACTIVATED", rejectionReason: result.reason,
                consecutiveFailedChecks: newFails, updatedAt: now,
              }).where(eq(watchNodes.walletAddress, node.walletAddress));
              audit("node_deactivated", "server-worker", node.walletAddress, result.reason);
              logger.info({ walletAddress: node.walletAddress }, "watch-worker: node deactivated");
            } else {
              await db.update(watchNodes).set({
                consecutiveFailedChecks: newFails,
                nextRecheckAt: new Date(now.getTime() + THIRTY_DAYS_MS), updatedAt: now,
              }).where(eq(watchNodes.walletAddress, node.walletAddress));
              audit("recheck_warning", "server-worker", node.walletAddress, `fail ${newFails}/2`);
            }
          } else {
            await db.update(watchNodes).set({
              consecutiveFailedChecks: 0,
              nextRecheckAt: new Date(now.getTime() + THIRTY_DAYS_MS), updatedAt: now,
            }).where(eq(watchNodes.walletAddress, node.walletAddress));
            audit("recheck_passed", "server-worker", node.walletAddress);
          }
        } catch (err) {
          logger.error({ err, walletAddress: node.walletAddress }, "watch-worker: error rechecking active node");
        }
      }
    } catch (err) {
      logger.error({ err }, "watch-worker: failed to query active nodes");
    }
  }

  async function purgeExpiredNonces(): Promise<void> {
    try {
      const expiry = new Date(Date.now() - NONCE_TTL_MS);
      await db.delete(watchNonces).where(lt(watchNonces.createdAt, expiry));
    } catch (err) {
      logger.error({ err }, "watch-worker: nonce cleanup failed");
    }
  }

  setInterval(() => { processPendingNodes().catch(() => {}); }, PENDING_INTERVAL);
  setInterval(() => { processActiveNodes().catch(() => {}); }, ACTIVE_INTERVAL);
  setInterval(() => { purgeExpiredNonces().catch(() => {}); }, NONCE_CLEANUP_INTERVAL);

  logger.info(
    {
      pendingIntervalSec: PENDING_INTERVAL / 1000,
      activeIntervalSec: ACTIVE_INTERVAL / 1000,
      nonceCleanupIntervalSec: NONCE_CLEANUP_INTERVAL / 1000,
    },
    "watch: background verification worker started",
  );
}

export { ADMIN_SECRET };
export const watchRouter = router;
