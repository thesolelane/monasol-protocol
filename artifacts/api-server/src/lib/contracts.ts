import { ethers } from "ethers";
import { provider, ethersSigner } from "./monad";

// Deployed addresses — path goes up from src/lib → src → api-server → artifacts → contracts/deployed
import addresses from "../../../contracts/deployed/monad_testnet-addresses.json";

// ---------------------------------------------------------------------------
// Minimal ABIs — only the functions the backend actually calls
// ---------------------------------------------------------------------------

const VAULT_FACTORY_ABI = [
  "function deployVault(address locker, uint256 slotIndex, bytes32 nftMint, address signingWallet, uint8 securityMode, address verifier) external returns (address vault)",
  "function predictVaultAddress(address locker, uint256 slotIndex, bytes32 nftMint, address signingWallet) external view returns (address)",
  "function authorizeCaller(address caller) external",
  "event VaultDeployed(address indexed vault, address indexed locker, uint256 slotIndex, bytes32 nftMint)",
] as const;

const LOCKER_ABI = [
  "function move_in(uint256 slot_index, address signing_wallet, bytes32 nft_mint, uint8 security_mode) external payable",
  "function move_in_fee() view returns (uint256)",
  "function open_session(uint256 slot_index) external",
  "function close_session(uint256 slot_index) external",
  "function transfer_lease(uint256 slot_index, address new_owner, address new_signer, bytes32 new_nft_mint) external",
  "function available_slots() external view returns (uint256)",
  "function capacity() external view returns (uint256)",
  "function is_full() external view returns (bool)",
  "function get_slot(uint256 index) external view returns (bool occupied, address occupant, address signer, uint8 mode, bool read_only, bool session_active)",
] as const;

const ORACLE_VERIFIER_ABI = [
  "function verifyAccess(bytes32 nftMint, address owner, uint256 expiry, bytes calldata proof) external view returns (bool)",
  "function addSigner(address signer) external",
  "function removeSigner(address signer) external",
  "function updateThreshold(uint256 threshold) external",
  "function pause() external",
  "function unpause() external",
] as const;

// ---------------------------------------------------------------------------
// Read-only instances (provider) — for view calls
// ---------------------------------------------------------------------------

export const vaultFactory = new ethers.Contract(
  addresses.vaultFactory,
  VAULT_FACTORY_ABI,
  provider
);

export const oracleVerifier = new ethers.Contract(
  addresses.oracleVerifier,
  ORACLE_VERIFIER_ABI,
  provider
);

/**
 * Returns a Locker contract instance connected to the given address.
 * Pass `write = true` to get a signer-connected instance for state-changing calls.
 */
export function getLocker(address: string, write = false): ethers.Contract {
  return new ethers.Contract(
    address,
    LOCKER_ABI,
    write ? ethersSigner : provider
  );
}

/**
 * Signer-connected VaultFactory for deployVault calls.
 */
export function getVaultFactoryWriter(): ethers.Contract {
  return vaultFactory.connect(ethersSigner) as ethers.Contract;
}

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

/** Returns the locker address for a given tier id, throws if not found */
export function getLockerAddress(lockerId: number): string {
  const entry = (addresses.lockers as Array<{ id: number; address: string }>)
    .find((l) => l.id === lockerId);
  if (!entry) throw new Error(`Unknown locker id: ${lockerId}`);
  return entry.address;
}

export { addresses };
