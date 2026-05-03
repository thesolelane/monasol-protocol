import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";

const router = Router();

// ─── Config ───────────────────────────────────────────────────────────────────

const VAULT_SECRET =
  process.env.VAULT_MASTER_SECRET ?? randomBytes(32).toString("hex");

if (!process.env.VAULT_MASTER_SECRET) {
  logger.warn(
    "vault: VAULT_MASTER_SECRET not set — vault auth will reset on restart",
  );
}

const VAULT_FILE = join(process.cwd(), ".vault.enc");
const VAULT_TOKEN_TTL = 4 * 60 * 60 * 1000;
const VAULT_MAX_FAILURES = 3;
const VAULT_LOCKOUT_MS = 15 * 60 * 1000;
const SALT = "monasolpro-vault-v1";

// ─── Encryption ───────────────────────────────────────────────────────────────

function deriveKey(): Buffer {
  return scryptSync(VAULT_SECRET, SALT, 32) as Buffer;
}

interface VaultData {
  secrets: Record<string, string>;
}

function readVault(): VaultData {
  if (!existsSync(VAULT_FILE)) return { secrets: {} };
  try {
    const raw = JSON.parse(readFileSync(VAULT_FILE, "utf8")) as {
      iv: string;
      tag: string;
      ct: string;
    };
    const key = deriveKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(raw.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(raw.tag, "base64"));
    const plain =
      decipher.update(Buffer.from(raw.ct, "base64")).toString("utf8") +
      decipher.final("utf8");
    return JSON.parse(plain) as VaultData;
  } catch (err) {
    logger.error({ err }, "vault: failed to decrypt vault file");
    return { secrets: {} };
  }
}

function writeVault(data: VaultData): void {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  writeFileSync(
    VAULT_FILE,
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ct: ct.toString("base64"),
    }),
    "utf8",
  );
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const vaultAttempts = new Map<
  string,
  { failures: number[]; lockedUntil: number }
>();

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

function checkVaultAuth(
  req: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return { ok: false, status: 401, error: "Unauthorized" };
  const token = auth.slice(7);
  const colonIdx = token.indexOf(":");
  if (colonIdx === -1) return { ok: false, status: 401, error: "Bad token" };
  const tsStr = token.slice(0, colonIdx);
  const mac = token.slice(colonIdx + 1);
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts) || Date.now() > ts)
    return { ok: false, status: 401, error: "Token expired" };
  const expected = createHmac("sha256", VAULT_SECRET)
    .update(`vault:${ts}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected);
  const macBuf = Buffer.from(mac);
  if (
    expectedBuf.length !== macBuf.length ||
    !timingSafeEqual(expectedBuf, macBuf)
  ) {
    return { ok: false, status: 401, error: "Invalid token" };
  }
  return { ok: true };
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const vaultLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Env key blocklist (never exposed) ───────────────────────────────────────

const ENV_BLOCKLIST = new Set([
  "PATH", "HOME", "PWD", "SHELL", "TERM", "USER", "LOGNAME",
  "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP",
]);

function isSystemKey(k: string): boolean {
  return (
    ENV_BLOCKLIST.has(k) ||
    k.startsWith("npm_") ||
    k.startsWith("NODE_") ||
    k.startsWith("PNPM_") ||
    k.startsWith("_")
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/token", vaultLoginLimiter, (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const attempts = vaultAttempts.get(ip) ?? { failures: [], lockedUntil: 0 };

  if (attempts.lockedUntil > now) {
    logger.warn({ ip }, "vault: locked-out IP attempted login");
    return res
      .status(429)
      .json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const { password } = req.body as { password?: string };
  if (!password) return res.status(400).json({ error: "Password required" });

  const secretBuf = Buffer.from(VAULT_SECRET);
  const providedBuf = Buffer.from(password);
  const valid =
    secretBuf.length === providedBuf.length &&
    timingSafeEqual(secretBuf, providedBuf);

  if (!valid) {
    const recent = [
      ...attempts.failures.filter((t) => now - t < 10 * 60 * 1000),
      now,
    ];
    const lockedUntil =
      recent.length >= VAULT_MAX_FAILURES ? now + VAULT_LOCKOUT_MS : 0;
    vaultAttempts.set(ip, { failures: recent, lockedUntil });
    logger.warn({ ip, attempt: recent.length }, "vault: failed login");
    if (lockedUntil) {
      return res
        .status(429)
        .json({ error: "Too many attempts. Locked for 15 minutes." });
    }
    return res.status(401).json({
      error: `Invalid password. ${VAULT_MAX_FAILURES - recent.length} attempt(s) remaining.`,
    });
  }

  vaultAttempts.set(ip, { failures: [], lockedUntil: 0 });
  const expiresAt = now + VAULT_TOKEN_TTL;
  const mac = createHmac("sha256", VAULT_SECRET)
    .update(`vault:${expiresAt}`)
    .digest("hex");
  logger.info({ ip }, "vault: successful login");
  return res.json({ token: `${expiresAt}:${mac}`, expiresAt });
});

router.get("/secrets", (req, res) => {
  const auth = checkVaultAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const vault = readVault();
  const envKeys = Object.keys(process.env)
    .filter((k) => !isSystemKey(k))
    .sort();

  return res.json({
    vault: Object.entries(vault.secrets).map(([key, value]) => ({
      key,
      value,
    })),
    env: envKeys.map((k) => ({ key: k, set: !!process.env[k] })),
  });
});

router.post("/secrets", (req, res) => {
  const auth = checkVaultAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { key, value } = req.body as { key?: string; value?: string };
  if (!key || !/^[A-Z0-9_]+$/.test(key)) {
    return res.status(400).json({
      error: "Key must be uppercase letters, numbers, and underscores only",
    });
  }
  if (typeof value !== "string") {
    return res.status(400).json({ error: "Value is required" });
  }

  const vault = readVault();
  vault.secrets[key] = value;
  writeVault(vault);
  logger.info({ key }, "vault: secret upserted");
  return res.json({ success: true });
});

router.delete("/secrets/:key", (req, res) => {
  const auth = checkVaultAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { key } = req.params;
  const vault = readVault();
  if (!(key in vault.secrets)) {
    return res.status(404).json({ error: "Secret not found" });
  }
  delete vault.secrets[key];
  writeVault(vault);
  logger.info({ key }, "vault: secret deleted");
  return res.json({ success: true });
});

export const vaultRouter = router;
