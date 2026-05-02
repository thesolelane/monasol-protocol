// =============================================================================
// src/routes/oracle.ts
// =============================================================================
// Phase 2 oracle routes — bridge between Monad events and Solana programs.
//
// Mounted at /api/oracle (app.ts mounts /api, routes/index.ts mounts /oracle)
//
//   POST /api/oracle/register-session    — after Monad move_in confirmed
//   POST /api/oracle/confirm-settlement  — after Monad settlement confirmed
//   POST /api/oracle/finalize-release    — operator triggers post-settlement
//   GET  /api/oracle/session/:leaseId    — read current on-chain session state
// =============================================================================

import { Router }    from "express";
import { z }         from "zod";
import { ethers }    from "ethers";
import { PublicKey } from "@solana/web3.js";
import { BN }        from "@coral-xyz/anchor";
import { logger }    from "../lib/logger";
import { oracleKeypair } from "../lib/solana";
import { ethersSigner }  from "../lib/monad";
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
// Guard — returns 503 when Solana is not configured in this environment
// -----------------------------------------------------------------------------

function requireOracle(res: any): boolean {
  if (!oracleKeypair) {
    res.status(503).json({
      success: false,
      error:   "Oracle signing is not configured in this environment. Set ORACLE_KEYPAIR and SOLANA_RPC_URL.",
    });
    return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------

const pubkeySchema = z.string().refine(
  (val) => { try { new PublicKey(val); return true; } catch { return false; } },
  { message: "Invalid Solana public key (base58)" }
);

const txHashSchema = z.string().regex(
  /^(0x)?[0-9a-fA-F]{64}$/,
  "Expected 32-byte hex string (with or without 0x prefix)"
);

const leaseIdSchema = z
  .union([z.string(), z.number()])
  .transform((val) => new BN(val.toString()));

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < 64; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

// -----------------------------------------------------------------------------
// POST /api/oracle/register-session
// Triggered by backend after Monad VaultMoveIn event is confirmed.
// -----------------------------------------------------------------------------

const registerSessionBody = z.object({
  leaseId:    leaseIdSchema,
  renter:     pubkeySchema,
  collection: pubkeySchema,
  asset:      pubkeySchema,
  monadTxRef: txHashSchema,
});

oracleRouter.post("/register-session", async (req, res) => {
  if (!requireOracle(res)) return;
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

  logger.info(
    { leaseId: leaseId.toString(), renter, vaultSession: vaultSession.toBase58() },
    "oracle: register-session request"
  );

  try {
    const sig = await registerSession({
      leaseId,
      renter:       renterPk,
      vaultSession,
      guardianSet,
      asset:        assetPk,
      collection:   collectionPk,
      monadTxRef:   hexToBytes(monadTxRef),
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
    logger.error({ err, leaseId: leaseId.toString() }, "oracle: register-session failed");
    return res.status(500).json({
      success: false,
      error:   err?.message ?? "register_session failed",
      leaseId: leaseId.toString(),
    });
  }
});

// -----------------------------------------------------------------------------
// POST /api/oracle/confirm-settlement
// Triggered by backend after Monad SessionSettled event is confirmed.
// Drives Pledged → Released on-chain. CPIs thaw_key + mark_settled.
// -----------------------------------------------------------------------------

const confirmSettlementBody = z.object({
  leaseId:     leaseIdSchema,
  monadTxHash: txHashSchema,
  guardianSet: pubkeySchema,
  asset:       pubkeySchema,
  collection:  pubkeySchema,
});

oracleRouter.post("/confirm-settlement", async (req, res) => {
  if (!requireOracle(res)) return;
  const parsed = confirmSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const { leaseId, monadTxHash, guardianSet, asset, collection } = parsed.data;

  logger.info(
    { leaseId: leaseId.toString(), monadTxHash },
    "oracle: confirm-settlement request"
  );

  // Pre-flight: verify session is Pledged before firing CPI chain
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
      success:      false,
      error:        `Session is not Pledged (current: ${Object.keys(sessionRecord.state)[0]})`,
      currentState: Object.keys(sessionRecord.state)[0],
      leaseId:      leaseId.toString(),
    });
  }

  try {
    const sig = await confirmSettlement({
      leaseId,
      monadTxHash:  hexToBytes(monadTxHash),
      guardianSet:  new PublicKey(guardianSet),
      asset:        new PublicKey(asset),
      collection:   new PublicKey(collection),
    });

    return res.status(200).json({
      success:       true,
      signature:     sig,
      sessionRecord: deriveSessionRecord(leaseId).toBase58(),
      leaseId:       leaseId.toString(),
      newState:      "Released",
    });
  } catch (err: any) {
    logger.error({ err, leaseId: leaseId.toString() }, "oracle: confirm-settlement failed");
    return res.status(500).json({
      success: false,
      error:   err?.message ?? "confirm_settlement failed",
      leaseId: leaseId.toString(),
    });
  }
});

// -----------------------------------------------------------------------------
// POST /api/oracle/finalize-release
// Operator-triggered after confirm-settlement.
// CPIs move_out (burn NFT) + close_guardian_set.
// Phase 2: operator keypair = oracle keypair.
// Phase 3+: add OPERATOR_KEYPAIR env var and split here.
// -----------------------------------------------------------------------------

const finalizeReleaseBody = z.object({
  leaseId:      leaseIdSchema,
  vaultSession: pubkeySchema,
  guardianSet:  pubkeySchema,
  asset:        pubkeySchema,
  collection:   pubkeySchema,
});

oracleRouter.post("/finalize-release", async (req, res) => {
  if (!requireOracle(res)) return;
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
    { leaseId: leaseId.toString(), vaultSession, guardianSet },
    "oracle: finalize-release request"
  );

  // Pre-flight: verify session is Released before burning
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
      error:        `Session is not Released (current: ${Object.keys(sessionRecord.state)[0]})`,
      currentState: Object.keys(sessionRecord.state)[0],
      leaseId:      leaseId.toString(),
    });
  }

  try {
    const sig = await finalizeRelease({
      leaseId,
      operatorKeypair: oracleKeypair!, // Phase 2: operator = oracle (guarded above)
      vaultSession:    new PublicKey(vaultSession),
      guardianSet:     new PublicKey(guardianSet),
      asset:           new PublicKey(asset),
      collection:      new PublicKey(collection),
    });

    return res.status(200).json({
      success:       true,
      signature:     sig,
      sessionRecord: deriveSessionRecord(leaseId).toBase58(),
      leaseId:       leaseId.toString(),
      newState:      "Closed",
    });
  } catch (err: any) {
    logger.error({ err, leaseId: leaseId.toString() }, "oracle: finalize-release failed");
    return res.status(500).json({
      success: false,
      error:   err?.message ?? "finalize_release failed",
      leaseId: leaseId.toString(),
    });
  }
});

// -----------------------------------------------------------------------------
// POST /api/oracle/sign-proof
//
// Signs an oracle proof for the Monad OracleVerifier contract.
// The deployer EVM key is an approved signer on OracleVerifier (threshold=1).
//
// Body: {
//   nftMint: string   — Solana NFT mint address (plain string, max 44 chars)
//   owner:   string   — Monad wallet address (0x...)
//   expiry:  number   — Unix timestamp in seconds (must be within 5 minutes)
// }
//
// Returns: { signature: "0x..." } — 65-byte ECDSA signature
//
// The signed digest matches OracleVerifier.verifyAccess:
//   keccak256(abi.encodePacked(nftMint as bytes32, owner, expiry, chainId=10143))
// -----------------------------------------------------------------------------

const MONAD_CHAIN_ID = 10143n;

const signProofBody = z.object({
  nftMint: z.string().min(1).max(44),
  owner:   z.string().regex(/^0x[0-9a-fA-F]{40}$/, "owner must be a valid EVM address"),
  expiry:  z.number().int().positive(),
});

oracleRouter.post("/sign-proof", async (req, res) => {
  const parsed = signProofBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const { nftMint, owner, expiry } = parsed.data;

  const now = Math.floor(Date.now() / 1000);
  if (expiry <= now) {
    return res.status(400).json({ success: false, error: "expiry must be in the future" });
  }
  if (expiry > now + 300) {
    return res.status(400).json({ success: false, error: "expiry must be within 5 minutes from now" });
  }

  try {
    const nftMintBytes32 = ethers.hexlify(new PublicKey(nftMint).toBytes());

    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "address", "uint256", "uint256"],
        [nftMintBytes32, owner, expiry, MONAD_CHAIN_ID]
      )
    );

    const signature = await ethersSigner.signMessage(ethers.getBytes(digest));

    const signerAddress = await ethersSigner.getAddress();

    logger.info({ nftMint, owner, expiry, signer: signerAddress }, "oracle: sign-proof produced");

    return res.status(200).json({
      success:   true,
      signature,
      nftMint,
      owner,
      expiry,
      signer:    signerAddress,
      chainId:   Number(MONAD_CHAIN_ID),
    });
  } catch (err: any) {
    logger.error({ err }, "oracle: sign-proof failed");
    return res.status(500).json({ success: false, error: err?.message ?? "sign-proof failed" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/oracle/session/:leaseId
// Read-only — returns current on-chain state for a session.
// No signing required.
// -----------------------------------------------------------------------------

oracleRouter.get("/session/:leaseId", async (req, res) => {
  let leaseId: BN;
  try {
    leaseId = new BN(req.params.leaseId);
  } catch {
    return res.status(400).json({ success: false, error: "Invalid leaseId" });
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
      state:        Object.keys(sessionRecord.state)[0],
      renter:       sessionRecord.renter.toBase58(),
      asset:        sessionRecord.asset.toBase58(),
      collection:   sessionRecord.collection.toBase58(),
      vaultSession: sessionRecord.vaultSession.toBase58(),
      guardianSet:  sessionRecord.guardianSet.toBase58(),
      registeredTs: sessionRecord.registeredTs.toString(),
      pledgedTs:    sessionRecord.pledgedTs.toString(),
      releasedTs:   sessionRecord.releasedTs.toString(),
      closedTs:     sessionRecord.closedTs.toString(),
    },
    guardian: guardianSet ? {
      status:          Object.keys(guardianSet.status)[0],
      shardsSubmitted: guardianSet.shardsSubmitted,
      approvals:       guardianSet.approvals,
      approvalMask:    guardianSet.approvalMask,
    } : null,
  });
});
