// =============================================================================
// src/lib/solana.ts
// =============================================================================
// Solana connection singleton and oracle keypair loader.
//
// Provides:
//   • connection  — shared Connection instance (commitment: confirmed)
//   • oracleKeypair — Keypair loaded from ORACLE_KEYPAIR env var
//   • getSolanaHealth — liveness check for /health endpoint
//
// ORACLE_KEYPAIR format: JSON byte array produced by `solana-keygen new`
//   e.g. [1,2,3,...,64 numbers]
//   Load into .env as a single line: ORACLE_KEYPAIR=[1,2,3,...,64]
// =============================================================================

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { logger }                          from "./logger";

// -----------------------------------------------------------------------------
// Env validation
// -----------------------------------------------------------------------------

const RPC_URL = process.env.SOLANA_RPC_URL;
if (!RPC_URL) {
  throw new Error("SOLANA_RPC_URL is not set");
}

const ORACLE_KEYPAIR_RAW = process.env.ORACLE_KEYPAIR;
if (!ORACLE_KEYPAIR_RAW) {
  throw new Error("ORACLE_KEYPAIR is not set");
}

// -----------------------------------------------------------------------------
// Connection singleton
// Commitment level: "confirmed" — balances speed against finality.
// Switch to "finalized" for the confirm_settlement route if stricter
// guarantees are needed for Monad settlement proofs.
// -----------------------------------------------------------------------------

export const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  disableRetryOnRateLimit: false,
});

logger.info({ rpc: RPC_URL }, "Solana connection initialised");

// -----------------------------------------------------------------------------
// Oracle keypair
// This keypair signs register_session and confirm_settlement transactions.
// It must match the oracle pubkey registered in OracleVerifier on-chain.
// -----------------------------------------------------------------------------

function loadOracleKeypair(): Keypair {
  let bytes: number[];

  try {
    bytes = JSON.parse(ORACLE_KEYPAIR_RAW!);
  } catch {
    throw new Error(
      "ORACLE_KEYPAIR is not valid JSON. Expected a byte array: [1,2,3,...,64]"
    );
  }

  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error(
      `ORACLE_KEYPAIR must be a 64-byte array, got ${Array.isArray(bytes) ? bytes.length : typeof bytes} bytes`
    );
  }

  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export const oracleKeypair = loadOracleKeypair();

logger.info(
  { oraclePubkey: oracleKeypair.publicKey.toBase58() },
  "Oracle keypair loaded"
);

// -----------------------------------------------------------------------------
// Program IDs — must match Anchor.toml after `anchor keys sync`
// Update these after deploying to devnet/mainnet.
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
// Health check
// -----------------------------------------------------------------------------

export async function getSolanaHealth(): Promise<{
  status: "ok" | "degraded";
  slot: number;
  rpc: string;
}> {
  try {
    const slot = await connection.getSlot("confirmed");
    return { status: "ok", slot, rpc: RPC_URL! };
  } catch (err) {
    logger.warn({ err }, "Solana health check failed");
    return { status: "degraded", slot: -1, rpc: RPC_URL! };
  }
}
