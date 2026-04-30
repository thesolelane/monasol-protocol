// =============================================================================
// src/routes/oracle.ts
// =============================================================================
// Phase 2 oracle routes — bridge between Monad events and Solana programs.
//
// Route map:
//   POST /api/oracle/register-session
//     Triggered by backend after Monad move_in event is confirmed.
//     Calls monasol_protocol::register_session (oracle signs).
//
//   POST /api/oracle/confirm-settlement
//     Triggered by backend after Monad settlement event is confirmed.
//     Calls monasol_protocol::confirm_settlement (oracle signs).
//     → CPIs: vault_key::thaw_key + guardian_multisig::mark_settled
//
//   POST /api/oracle/finalize-release
//     Triggered by operator after confirm-settlement.
//     Calls monasol_protocol::finalize_release (operator signs).
//     → CPIs: vault_key::move_out + guardian_multisig::close_guardian_set
//
// All routes:
//   • Validate request body with zod
//   • Log every step with structured logger
//   • Return { success, signature, ... } on success
//   • Return { success: false, error } on failure — never throw to caller
// =============================================================================

import { Router }    from "express";
import { z }         from "zod";
import { PublicKey } from "@solana/web3.js";
import { BN }        from "@coral-xyz/anchor";
import { logger }    from "../lib/logger";
import {
  registerSession,
  confirmSettlement,
  finalizeRelease,
  fetchSessionRecord,
  fetchGuardianSet,
  deriveVaultSession,
  deriveGuardianSet,
  deriveSessionRecord,
} from "../lib/oracle-client";

export const oracleRouter = Router();

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------

/** Validates a base58 Solana public key string. */
const pubkeySchema = z.string().refine(
  (val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid Solana public key (base58)" }
);

/** Validates a 32-byte hex string (Monad tx hash). */
const txHashSchema = z.string().regex(
  /^(0x)?[0-9a-fA-F]{64}$/,
  "Expected 32-byte hex string (with or without 0x prefix)"
);

/** Converts a hex tx hash to number[] for Anchor instruction args. */
function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < 64; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

/** Zod schema for u64 lease IDs — accepts string or number. */
const leaseIdSchema = z
  .union([z.string(), z.number()])
  .transform((val) => new BN(val.toString()));

// -----------------------------------------------------------------------------
// POST /api/oracle/register-session
// -----------------------------------------------------------------------------

const registerSessionBody = z.object({
  leaseId:    leaseIdSchema,
  renter:     pubkeySchema,
  collection: pubkeySchema,
  asset:      pubkeySchema,
  monadTxRef: txHashSchema,
});

oracleRouter.post("/register-session", async (req, res) => {
  const parsed = registerSessionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const { leaseId, renter, collection, asset, monadTxRef } = parsed.data;

  const renterPk     = new PublicKey(renter);
  const collectionPk = new PublicKey(collection);
  const assetPk      = new PublicKey(asset);

  const vaultSession = deriveVaultSession(renterPk, collectionPk);
  const guardianSet  = deriveGuardianSet(leaseId);
  const monadTxRefBytes = hexToBytes(monadTxRef);

  logger.info(
    {
      leaseId:      leaseId.toString(),
      renter,
      vaultSession: vaultSession.toBase58(),
      guardianSet:  guardianSet.toBase58(),
    },
    "oracle: register-session request received"
  );

  try {
    const sig = await registerSession({
      leaseId,
      renter:       renterPk,
      vaultSession,
      guardianSet,
      asset:        assetPk,
      collection:   collectionPk,
      monadTxRef:   monadTxRefBytes,
    });

    return res.status(200).json({
      success:       true,
      signature:     sig,
      sessionRecord: deriveSessionRecord(leaseId).toBase58(),
      vaultSession:  vaultSession.toBase58(),
      guardianSet:   guardianSet.toBase58(),
      leaseId:       leaseId.toString(),
    });
  } catch (err: any) {
    logger.error(
      { err, leaseId: leaseId.toString() },
      "oracle: register-session failed"
    );

    return res.status(500).json({
      success: false,
      error:   err?.message ?? "register_session instruction failed",
      leaseId: leaseId.toString(),
    });
  }
});

// -----------------------------------------------------------------------------
// POST /api/oracle/confirm-settlement
// -----------------------------------------------------------------------------

const confirmSettlementBody = z.object({
  leaseId:      leaseIdSchema,
  monadTxHash:  txHashSchema,
  guardianSet:  pubkeySchema,
  asset:        pubkeySchema,
  collection:   pubkeySchema,
});

oracleRouter.post("/confirm-settlement", async (req, res) => {
  const parsed = confirmSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const { leaseId, monadTxHash, guardianSet, asset, collection } = parsed.data;

  const guardianSetPk = new PublicKey(guardianSet);
  const assetPk       = new PublicKey(asset);
  const collectionPk  = new PublicKey(collection);
  const monadTxHashBytes = hexToBytes(monadTxHash);

  logger.info(
    {
      leaseId:     leaseId.toString(),
      monadTxHash,
      guardianSet,
    },
    "oracle: confirm-settlement request received"
  );

  // Verify session is in Pledged state before submitting CPI chain
  const sessionRecord = await fetchSessionRecord(leaseId);
  if (!sessionRecord) {
    return res.status(404).json({
      success: false,
      error:   "SessionRecord not found — call register-session first",
      leaseId: leaseId.toString(),
    });
  }

  if (!("pledged" in sessionRecord.state)) {
    return res.status(409).json({
      success:       false,
      error:         `Session is not in Pledged state (current: ${Object.keys(sessionRecord.state)[0]})`,
      currentState:  Object.keys(sessionRecord.state)[0],
      leaseId:       leaseId.toString(),
    });
  }

  try {
    const sig = await confirmSettlement({
      leaseId,
      monadTxHash:  monadTxHashBytes,
      guardianSet:  guardianSetPk,
      asset:        assetPk,
      collection:   collectionPk,
    });

    return res.status(200).json({
      success:       true,
      signature:     sig,
      sessionRecord: deriveSessionRecord(leaseId).toBase58(),
      leaseId:       leaseId.toString(),
      newState:      "Released",
    });
  } catch (err: any) {
    logger.error(
      { err, leaseId: leaseId.toString() },
      "oracle: confirm-settlement failed"
    );

    return res.status(500).json({
      success: false,
      error:   err?.message ?? "confirm_settlement instruction failed",
      leaseId: leaseId.toString(),
    });
  }
});

// -----------------------------------------------------------------------------
// POST /api/oracle/finalize-release
// -----------------------------------------------------------------------------

const finalizeReleaseBody = z.object({
  leaseId:    leaseIdSchema,
  vaultSession: pubkeySchema,
  guardianSet:  pubkeySchema,
  asset:        pubkeySchema,
  collection:   pubkeySchema,
});

oracleRouter.post("/finalize-release", async (req, res) => {
  const parsed = finalizeReleaseBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const { leaseId, vaultSession, guardianSet, asset, collection } = parsed.data;

  logger.info(
    {
      leaseId:      leaseId.toString(),
      vaultSession,
      guardianSet,
    },
    "oracle: finalize-release request received"
  );

  // Verify session is in Released state before burning
  const sessionRecord = await fetchSessionRecord(leaseId);
  if (!sessionRecord) {
    return res.status(404).json({
      success: false,
      error:   "SessionRecord not found",
      leaseId: leaseId.toString(),
    });
  }

  if (!("released" in sessionRecord.state)) {
    return res.status(409).json({
      success:      false,
      error:        `Session is not in Released state (current: ${Object.keys(sessionRecord.state)[0]})`,
      currentState: Object.keys(sessionRecord.state)[0],
      leaseId:      leaseId.toString(),
    });
  }

  // Operator keypair — loaded from env
  // In Phase 2 the operator is the same as the oracle for simplicity.
  // Phase 3+ can separate these with a dedicated OPERATOR_KEYPAIR env var.
  const { oracleKeypair } = await import("./solana");
  const operatorKeypair = oracleKeypair;

  try {
    const sig = await finalizeRelease({
      leaseId,
      operatorKeypair,
      vaultSession: new PublicKey(vaultSession),
      guardianSet:  new PublicKey(guardianSet),
      asset:        new PublicKey(asset),
      collection:   new PublicKey(collection),
    });

    return res.status(200).json({
      success:       true,
      signature:     sig,
      sessionRecord: deriveSessionRecord(leaseId).toBase58(),
      leaseId:       leaseId.toString(),
      newState:      "Closed",
    });
  } catch (err: any) {
    logger.error(
      { err, leaseId: leaseId.toString() },
      "oracle: finalize-release failed"
    );

    return res.status(500).json({
      success: false,
      error:   err?.message ?? "finalize_release instruction failed",
      leaseId: leaseId.toString(),
    });
  }
});

// -----------------------------------------------------------------------------
// GET /api/oracle/session/:leaseId
// Read-only — returns current on-chain state for a session.
// -----------------------------------------------------------------------------

oracleRouter.get("/session/:leaseId", async (req, res) => {
  let leaseId: BN;
  try {
    leaseId = new BN(req.params.leaseId);
  } catch {
    return res.status(400).json({
      success: false,
      error:   "Invalid leaseId — must be a u64 integer",
    });
  }

  const [sessionRecord, guardianSet] = await Promise.all([
    fetchSessionRecord(leaseId),
    fetchGuardianSet(leaseId),
  ]);

  if (!sessionRecord) {
    return res.status(404).json({
      success: false,
      error:   "SessionRecord not found",
      leaseId: leaseId.toString(),
    });
  }

  return res.status(200).json({
    success: true,
    leaseId: leaseId.toString(),
    session: {
      state:         Object.keys(sessionRecord.state)[0],
      renter:        sessionRecord.renter.toBase58(),
      asset:         sessionRecord.asset.toBase58(),
      collection:    sessionRecord.collection.toBase58(),
      vaultSession:  sessionRecord.vaultSession.toBase58(),
      guardianSet:   sessionRecord.guardianSet.toBase58(),
      registeredTs:  sessionRecord.registeredTs.toString(),
      pledgedTs:     sessionRecord.pledgedTs.toString(),
      releasedTs:    sessionRecord.releasedTs.toString(),
      closedTs:      sessionRecord.closedTs.toString(),
    },
    guardian: guardianSet
      ? {
          status:           Object.keys(guardianSet.status)[0],
          shardsSubmitted:  guardianSet.shardsSubmitted,
          approvals:        guardianSet.approvals,
          approvalMask:     guardianSet.approvalMask,
        }
      : null,
  });
});
