import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import {
  provider,
  getNextNonce,
  resetNonce,
  BASE_FEE,
  PRIORITY_FEE,
  GAS_LIMITS,
} from "../lib/monad";
import {
  getVaultFactoryWriter,
  getLocker,
  getLockerAddress,
  addresses,
} from "../lib/contracts";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise any ethers/contract error into a loggable string */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** True if the error looks like a nonce collision */
function isNonceError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return msg.includes("nonce") || msg.includes("replacement transaction");
}

/**
 * Sends a contract transaction with explicit gas params (Monad charges
 * gasLimit not gasUsed, so we keep limits tight and set fees manually).
 */
async function sendWithNonce(
  contractFn: (overrides: object) => Promise<ethers.TransactionResponse>,
  gasLimit: bigint
): Promise<ethers.TransactionResponse> {
  const nonce = await getNextNonce();
  try {
    return await contractFn({
      nonce,
      gasLimit,
      maxFeePerGas: BASE_FEE + PRIORITY_FEE,
      maxPriorityFeePerGas: PRIORITY_FEE,
    });
  } catch (err) {
    if (isNonceError(err)) {
      resetNonce();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /api/vaults/deploy
//
// Body: {
//   lockerId:      number   — index into addresses.lockers
//   slotIndex:     number
//   nftMint:       string   — hex bytes32 (0x…)
//   signingWallet: string   — guardian address
//   securityMode:  number   — 0 = standard, 1 = strict
// }
//
// Flow:
//   1. Validate body
//   2. Check locker slot is free (on-chain read)
//   3. Call VaultFactory.deployVault
//   4. Wait for confirmation
//   5. Parse VaultDeployed event to get vault address
//   6. Persist vault record + log transaction
// ---------------------------------------------------------------------------

router.post("/deploy", async (req: Request, res: Response) => {
  const { lockerId, slotIndex, nftMint, signingWallet, securityMode } =
    req.body ?? {};

  if (
    lockerId === undefined ||
    slotIndex === undefined ||
    !nftMint ||
    !signingWallet ||
    securityMode === undefined
  ) {
    return res.status(400).json({ error: "Missing required fields: lockerId, slotIndex, nftMint, signingWallet, securityMode" });
  }

  if (!ethers.isAddress(signingWallet)) {
    return res.status(400).json({ error: "signingWallet is not a valid address" });
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(nftMint)) {
    return res.status(400).json({ error: "nftMint must be a 0x-prefixed 32-byte hex string" });
  }

  let lockerAddress: string;
  try {
    lockerAddress = getLockerAddress(Number(lockerId));
  } catch {
    return res.status(400).json({ error: `Invalid lockerId: ${lockerId}` });
  }

  try {
    // Guard: check slot isn't already occupied
    const locker = getLocker(lockerAddress);
    const slot = await locker.get_slot(slotIndex);
    if (slot.occupied) {
      return res.status(409).json({ error: "Slot is already occupied" });
    }

    // Deploy
    const factory = getVaultFactoryWriter();
    const tx = await sendWithNonce(
      (overrides) =>
        factory.deployVault(
          lockerAddress,
          slotIndex,
          nftMint,
          signingWallet,
          securityMode,
          addresses.oracleVerifier,
          overrides
        ),
      GAS_LIMITS.deployVault
    );

    logger.info({ txHash: tx.hash }, "deployVault tx submitted");

    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) {
      throw new Error(`Transaction reverted: ${tx.hash}`);
    }

    // Parse VaultDeployed event to get the new vault address
    const factoryInterface = factory.interface;
    let vaultAddress: string | null = null;
    for (const log of receipt.logs) {
      try {
        const parsed = factoryInterface.parseLog(log);
        if (parsed?.name === "VaultDeployed") {
          vaultAddress = parsed.args.vault as string;
          break;
        }
      } catch {
        // not our event
      }
    }

    if (!vaultAddress) {
      throw new Error("VaultDeployed event not found in receipt");
    }

    // Persist
    const vault = await storage.createVault({
      address: vaultAddress,
      locker: lockerAddress,
      slotIndex: Number(slotIndex),
      nftMint,
      signingWallet,
      securityMode: Number(securityMode),
      txHash: tx.hash,
      deployedAt: new Date(),
    });

    await storage.logTransaction({
      vaultAddress,
      action: "deploy",
      txHash: tx.hash,
      callerWallet: signingWallet,
      metadata: { lockerId, slotIndex, nftMint, securityMode },
      createdAt: new Date(),
    });

    logger.info({ vaultAddress, txHash: tx.hash }, "vault deployed");

    return res.status(201).json({
      vault: vaultAddress,
      locker: lockerAddress,
      slotIndex,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (err) {
    logger.error({ err: errorMessage(err) }, "deployVault failed");
    return res.status(500).json({ error: "Failed to deploy vault" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/vaults/session/open
//
// Body: {
//   vaultAddress: string   — deployed vault address (used to look up locker/slot)
//   nftMint:      string   — hex bytes32
// }
//
// Flow:
//   1. Look up vault record to get locker + slotIndex
//   2. Confirm slot has no active session (on-chain read)
//   3. Call Locker.open_session(slotIndex)
//   4. Wait for confirmation
//   5. Update nftKeys session state in DB
//   6. Log transaction
// ---------------------------------------------------------------------------

router.post("/session/open", async (req: Request, res: Response) => {
  const { vaultAddress, nftMint } = req.body ?? {};

  if (!vaultAddress || !nftMint) {
    return res.status(400).json({ error: "Missing required fields: vaultAddress, nftMint" });
  }

  if (!ethers.isAddress(vaultAddress)) {
    return res.status(400).json({ error: "vaultAddress is not a valid address" });
  }

  try {
    // Look up the vault record so we know which locker + slot to call
    const vault = await storage.getVaultByAddress(vaultAddress);
    if (!vault) {
      return res.status(404).json({ error: "Vault not found" });
    }

    // Guard: check session isn't already open on-chain
    const locker = getLocker(vault.locker);
    const slot = await locker.get_slot(vault.slotIndex);
    if (slot.session_active) {
      return res.status(409).json({ error: "Session is already open for this slot" });
    }

    // Open session
    const lockerWriter = getLocker(vault.locker, true);
    const tx = await sendWithNonce(
      (overrides) => lockerWriter.open_session(vault.slotIndex, overrides),
      GAS_LIMITS.openSession
    );

    logger.info({ txHash: tx.hash, vaultAddress }, "open_session tx submitted");

    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) {
      throw new Error(`Transaction reverted: ${tx.hash}`);
    }

    // Persist — update nftKeys row and create session record
    const now = new Date();
    await storage.updateVaultSessionState(nftMint, true, null, false);
    await storage.createVaultSession({
      vaultId:           vaultAddress,
      nftMint,
      sessionId:         tx.hash,
      authorizedAddress: vault.signingWallet,
      label:             `slot-${vault.slotIndex}`,
      expiresAt:         new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status:            "open",
    });

    await storage.logTransaction({
      vaultAddress,
      action: "session_open",
      txHash: tx.hash,
      callerWallet: vault.signingWallet,
      metadata: { slotIndex: vault.slotIndex, nftMint },
      createdAt: now,
    });

    logger.info({ vaultAddress, txHash: tx.hash }, "session opened");

    return res.json({
      vaultAddress,
      sessionOpen: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (err) {
    logger.error({ err: errorMessage(err) }, "open_session failed");
    return res.status(500).json({ error: "Failed to open session" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/vaults/lease/transfer
//
// Body: {
//   vaultAddress:  string   — deployed vault address
//   newOwner:      string   — new occupant address
//   newSigner:     string   — new guardian signing wallet
//   newNftMint:    string   — hex bytes32 for new NFT key
// }
//
// Flow:
//   1. Look up vault record
//   2. Confirm slot is occupied and no active session (on-chain read)
//   3. Call Locker.transfer_lease(slotIndex, newOwner, newSigner, newNftMint)
//   4. Wait for confirmation
//   5. Update vault record + log transaction
// ---------------------------------------------------------------------------

router.post("/lease/transfer", async (req: Request, res: Response) => {
  const { vaultAddress, newOwner, newSigner, newNftMint } = req.body ?? {};

  if (!vaultAddress || !newOwner || !newSigner || !newNftMint) {
    return res.status(400).json({ error: "Missing required fields: vaultAddress, newOwner, newSigner, newNftMint" });
  }

  for (const [name, addr] of [["newOwner", newOwner], ["newSigner", newSigner], ["vaultAddress", vaultAddress]] as const) {
    if (!ethers.isAddress(addr)) {
      return res.status(400).json({ error: `${name} is not a valid address` });
    }
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(newNftMint)) {
    return res.status(400).json({ error: "newNftMint must be a 0x-prefixed 32-byte hex string" });
  }

  try {
    const vault = await storage.getVaultByAddress(vaultAddress);
    if (!vault) {
      return res.status(404).json({ error: "Vault not found" });
    }

    // Guard: slot must be occupied, session must be closed
    const locker = getLocker(vault.locker);
    const slot = await locker.get_slot(vault.slotIndex);
    if (!slot.occupied) {
      return res.status(409).json({ error: "Slot is not occupied — nothing to transfer" });
    }
    if (slot.session_active) {
      return res.status(409).json({ error: "Close the active session before transferring the lease" });
    }

    // Transfer
    const lockerWriter = getLocker(vault.locker, true);
    const tx = await sendWithNonce(
      (overrides) =>
        lockerWriter.transfer_lease(
          vault.slotIndex,
          newOwner,
          newSigner,
          newNftMint,
          overrides
        ),
      GAS_LIMITS.transferLease
    );

    logger.info({ txHash: tx.hash, vaultAddress }, "transfer_lease tx submitted");

    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) {
      throw new Error(`Transaction reverted: ${tx.hash}`);
    }

    await storage.logTransaction({
      vaultAddress,
      action: "lease_transfer",
      txHash: tx.hash,
      callerWallet: newOwner,
      metadata: {
        slotIndex: vault.slotIndex,
        previousOwner: vault.signingWallet,
        newOwner,
        newSigner,
        newNftMint,
      },
      createdAt: new Date(),
    });

    logger.info({ vaultAddress, newOwner, txHash: tx.hash }, "lease transferred");

    return res.json({
      vaultAddress,
      newOwner,
      newSigner,
      newNftMint,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (err) {
    logger.error({ err: errorMessage(err) }, "transfer_lease failed");
    return res.status(500).json({ error: "Failed to transfer lease" });
  }
});

export default router;
