import { ethers } from "ethers";
import { EthersWalletSigner } from "./signer";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Provider singleton
// ---------------------------------------------------------------------------

const RPC_URL =
  process.env.MONAD_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz";

export const provider = new ethers.JsonRpcProvider(RPC_URL);

// ---------------------------------------------------------------------------
// Signer singleton
// ---------------------------------------------------------------------------

if (!process.env.DEPLOYER_PRIVATE_KEY) {
  throw new Error("DEPLOYER_PRIVATE_KEY is not set");
}

export const walletSigner = new EthersWalletSigner(
  process.env.DEPLOYER_PRIVATE_KEY,
  provider
);

/** Raw ethers.Wallet for contract.connect() calls */
export const ethersSigner = walletSigner.asEthersSigner();

// ---------------------------------------------------------------------------
// Nonce manager
//
// Monad: eth_getTransactionCount only updates after finality.  If two
// endpoints fire in the same block window from the same wallet the second tx
// will collide.  We track nonce locally and only re-sync from chain on error.
// ---------------------------------------------------------------------------

let localNonce: number | null = null;
let nonceLock = false;
const nonceQueue: Array<() => void> = [];

async function acquireLock(): Promise<void> {
  if (!nonceLock) {
    nonceLock = true;
    return;
  }
  return new Promise((resolve) => nonceQueue.push(resolve));
}

function releaseLock(): void {
  const next = nonceQueue.shift();
  if (next) {
    next();
  } else {
    nonceLock = false;
  }
}

/**
 * Returns the next nonce to use and increments the local counter.
 * Fetches from chain on first call or after a nonce-related error.
 */
export async function getNextNonce(): Promise<number> {
  await acquireLock();
  try {
    if (localNonce === null) {
      const address = await walletSigner.getAddress();
      localNonce = await provider.getTransactionCount(address, "pending");
      logger.info({ localNonce }, "nonce manager: synced from chain");
    }
    return localNonce++;
  } finally {
    releaseLock();
  }
}

/**
 * Call this when a tx fails with a nonce error so the next call re-syncs.
 */
export function resetNonce(): void {
  localNonce = null;
  logger.warn("nonce manager: reset — will re-sync from chain on next use");
}

// ---------------------------------------------------------------------------
// Gas constants (Monad charges gasLimit, not gasUsed — keep these tight)
// ---------------------------------------------------------------------------

/** 100 MON-gwei — chain minimum */
export const BASE_FEE = ethers.parseUnits("100", "gwei");
/** Small priority tip — enough to not be last in block */
export const PRIORITY_FEE = ethers.parseUnits("1", "gwei");

export const GAS_LIMITS = {
  deployVault:      800_000n,
  openSession:      120_000n,
  closeSession:     80_000n,
  transferLease:    150_000n,
} as const;
