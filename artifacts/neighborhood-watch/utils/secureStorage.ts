import * as SecureStore from "expo-secure-store";

export const STORAGE_KEYS = {
  WALLET_ADDRESS:   "nw_wallet",
  CHAIN:            "nw_chain",
  X_HANDLE:         "nw_x_handle",
  TELEGRAM_HANDLE:  "nw_telegram",
  DISCORD_HANDLE:   "nw_discord",
  NODE_STATUS:      "nw_status",
  REGISTERED_AT:    "nw_registered_at",
  VERIFICATION_DUE: "nw_verification_due",
  ED25519_SK:       "nw_ed25519_sk",
  ED25519_PK:       "nw_ed25519_pk",
  NONCE:            "nw_nonce",
  REJECTION_REASON: "nw_rejection_reason",
  TIER:             "nw_tier",
  /**
   * Unix millisecond timestamp at which this node transitioned from PENDING to ACTIVE.
   * Observations with a timestamp earlier than this value MUST NOT be submitted as
   * reports — they were accumulated during the 48h pending window and have no report
   * slot (the server rejects PENDING-node reports). This field provides a hard
   * replay-prevention boundary that survives app restarts across the activation event.
   */
  ACTIVATED_AT:     "nw_activated_at",
};

/**
 * SecureStore options for Ed25519 private key material.
 *
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY:
 * - iOS: Keychain with kSecAttrAccessibleWhenUnlockedThisDeviceOnly
 *   (not backed up to iCloud; wiped on device restore).
 * - Android: Android Keystore, bound to this device.
 * - On devices with Secure Enclave / StrongBox the key is hardware-backed
 *   and non-exportable. On devices without a hardware security module the
 *   key is software-backed — this is a managed Expo workflow limitation
 *   (requires react-native-keychain with specific hardware flags to force
 *   hardware-backed storage unconditionally).
 */
const SK_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

/** Read the signing private key, using tighter Keychain/Keystore options. */
export async function secureGetSk(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, SK_OPTIONS);
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Silently fail on web where SecureStore may not persist
  }
}

/** Store the signing private key with tighter Keychain/Keystore options. */
export async function secureSetSk(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, SK_OPTIONS);
  } catch {
    // Silently fail on web
  }
}

export async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore
  }
  try {
    await SecureStore.deleteItemAsync(key, SK_OPTIONS);
  } catch {
    // Ignore
  }
}

export async function incrementNonce(key: string): Promise<number> {
  const raw = await secureGet(key);
  const current = raw ? parseInt(raw, 10) : 0;
  const next = current + 1;
  await secureSet(key, String(next));
  return next;
}
