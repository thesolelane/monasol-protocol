// =============================================================================
// src/lib/solana.ts
// =============================================================================
// Solana connection singleton and oracle keypair loader.
//
// Env vars required:
//   SOLANA_RPC_URL   — Solana RPC endpoint (devnet / mainnet-beta)
//   ORACLE_KEYPAIR   — base58-encoded 64-byte secret key
//                      (solana-keygen export, or Phantom "export private key")
//
// Program ID env vars (optional — fall back to placeholder values):
//   VAULT_KEY_PROGRAM_ID
//   GUARDIAN_MULTISIG_PROGRAM_ID
//   MONASOL_PROTOCOL_PROGRAM_ID
// =============================================================================

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58                               from "bs58";
import { logger }                         from "./logger";

// -----------------------------------------------------------------------------
// Env validation — fail fast at startup
// -----------------------------------------------------------------------------

const RPC_URL = process.env.SOLANA_RPC_URL;
if (!RPC_URL) throw new Error("SOLANA_RPC_URL is not set");

const ORACLE_KEYPAIR_RAW = process.env.ORACLE_KEYPAIR;
if (!ORACLE_KEYPAIR_RAW) throw new Error("ORACLE_KEYPAIR is not set");

// -----------------------------------------------------------------------------
// Connection singleton
// commitment: "confirmed" — balances speed against finality.
// Use "finalized" for confirm_settlement if stricter guarantees are needed.
// -----------------------------------------------------------------------------

export const connection = new Connection(RPC_URL, {
  commitment:              "confirmed",
  disableRetryOnRateLimit: false,
});

logger.info({ rpc: RPC_URL }, "Solana connection initialised");

// -----------------------------------------------------------------------------
// Oracle keypair — base58 decode
// -----------------------------------------------------------------------------

function loadOracleKeypair(): Keypair {
  let decoded: Uint8Array;

  try {
    decoded = bs58.decode(ORACLE_KEYPAIR_RAW!);
  } catch {
    throw new Error(
      "ORACLE_KEYPAIR is not valid base58. Expected a base58-encoded 64-byte secret key."
    );
  }

  if (decoded.length !== 64) {
    throw new Error(
      `ORACLE_KEYPAIR decoded to ${decoded.length} bytes — expected 64.`
    );
  }

  return Keypair.fromSecretKey(decoded);
}

export const oracleKeypair = loadOracleKeypair();

logger.info(
  { oraclePubkey: oracleKeypair.publicKey.toBase58() },
  "Oracle keypair loaded"
);

// -----------------------------------------------------------------------------
// Program IDs — env-overridable so the same binary works across clusters
// -----------------------------------------------------------------------------

export const VAULT_KEY_PROGRAM_ID = new PublicKey(
  process.env.VAULT_KEY_PROGRAM_ID ??
    "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

export const GUARDIAN_MULTISIG_PROGRAM_ID = new PublicKey(
  process.env.GUARDIAN_MULTISIG_PROGRAM_ID ??
    "4Nd1mBQtrMJVYVfKf2PX8Q7pSe8KBnM23sYs5KGR2ZtG"
);

export const MONASOL_PROTOCOL_PROGRAM_ID = new PublicKey(
  process.env.MONASOL_PROTOCOL_PROGRAM_ID ??
    "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
);

export const MPL_CORE_PROGRAM_ID = new PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
);

// -----------------------------------------------------------------------------
// Health check — used by /api/health
// -----------------------------------------------------------------------------

export async function getSolanaHealth(): Promise<{
  status: "ok" | "degraded";
  slot:   number;
  rpc:    string;
}> {
  try {
    const slot = await connection.getSlot("confirmed");
    return { status: "ok", slot, rpc: RPC_URL! };
  } catch (err) {
    logger.warn({ err }, "Solana health check failed");
    return { status: "degraded", slot: -1, rpc: RPC_URL! };
  }
}
