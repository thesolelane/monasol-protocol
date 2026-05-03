/**
 * SecureSigningModule — device-native Ed25519 / ECDSA signing abstraction.
 *
 * # Security architecture
 *
 * The Neighborhood Watch app requires device-bound signing keys that cannot
 * be exported from the device even if the JS runtime is compromised. This
 * module provides the correct abstraction layer for that requirement.
 *
 * ## Production (EAS Build with custom native module)
 *
 * A production EAS Build should include a custom Expo native module that
 * wraps platform-native non-exportable key generation and signing:
 *
 *   iOS  — SecKeyCreateRandomKey + SecKeyCreateSignature with
 *           kSecAttrTokenIDSecureEnclave and kSecAttrKeyTypeECSECPrimeRandom.
 *           The private key never leaves the Secure Enclave co-processor.
 *
 *   Android — android.security.keystore.KeyPairGenerator with
 *              setKeySize(256), setIsStrongBoxBacked(true) (Pixel 3+), and
 *              PURPOSE_SIGN. The private key is non-exportable from the
 *              Android Keystore hardware-backed TEE / StrongBox.
 *
 * Until that native module is built, this file falls back to tweetnacl Ed25519
 * with keys stored in expo-secure-store. The fallback is NOT hardware-backed
 * and the private key bytes CAN be read back by JS code.
 *
 * ## Managed Expo / Expo Go (current environment)
 *
 * expo-secure-store with WHEN_UNLOCKED_THIS_DEVICE_ONLY provides:
 * - iOS: Keychain item not backed up to iCloud, device-bound.
 * - Android: Wrapped by the Android Keystore, hardware-backed on supported devices.
 * But the key bytes are returned as a string to JS → exportable by JS runtime.
 *
 * This is the honest security posture of the current managed workflow build.
 */

import nacl from "tweetnacl";
import {
  STORAGE_KEYS,
  secureGetSk,
} from "@/utils/secureStorage";

// ── Capability detection ────────────────────────────────────────────────────

/**
 * Returns true only when running inside a custom EAS Build that includes
 * a native Secure Enclave / StrongBox signing module. Always false in
 * managed Expo Go.
 *
 * When this returns false, signing falls back to tweetnacl (software-backed).
 */
export function isHardwareBackedSigningAvailable(): boolean {
  // Native module would expose a global or be importable here.
  // In managed Expo there is no such module — return false honestly.
  return false;
}

// ── Signing ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sign a Neighborhood Watch report message using the device signing key.
 *
 * Canonical message format (must match server verification exactly):
 *   report:<wallet>:<locker>:<alertType>:<severity>:<nonce>:<timestamp>
 *
 * In a production EAS Build with a native secure enclave module, this function
 * would call the native module directly and the private key bytes would never
 * enter JS memory. In managed Expo, it falls back to tweetnacl with the key
 * read from expo-secure-store.
 *
 * @returns Hex-encoded 64-byte Ed25519 detached signature.
 */
export async function signReportMessage(
  walletAddress: string,
  lockerAddress: string,
  alertType: string,
  severity: number,
  nonce: string,
  timestamp: number,
): Promise<string> {
  const canonical = `report:${walletAddress}:${lockerAddress}:${alertType}:${severity}:${nonce}:${timestamp}`;
  const msgBytes = new TextEncoder().encode(canonical);

  if (isHardwareBackedSigningAvailable()) {
    // PRODUCTION PATH (EAS Build with native module):
    // return await NativeSecureSigningModule.sign(canonical);
    throw new Error("Native signing module not loaded — this path should not be reached in managed Expo");
  }

  // FALLBACK PATH (managed Expo / Expo Go):
  // The private key is loaded from expo-secure-store and used in JS memory.
  // This is software-backed; true non-exportable signing requires EAS Build.
  const skHex = await secureGetSk(STORAGE_KEYS.ED25519_SK);
  if (!skHex) throw new Error("Device signing key not found in secure storage");

  const sk = hexToBytes(skHex);
  const signature = nacl.sign.detached(msgBytes, sk);
  return bytesToHex(signature);
}

/**
 * Sign a device key rotation challenge.
 * Canonical: rotate:<challenge>:<newPublicKey>
 *
 * @returns Hex-encoded 64-byte Ed25519 detached signature.
 */
export async function signRotationChallenge(
  challenge: string,
  newPublicKey: string,
): Promise<string> {
  const canonical = `rotate:${challenge}:${newPublicKey}`;
  const msgBytes = new TextEncoder().encode(canonical);

  const skHex = await secureGetSk(STORAGE_KEYS.ED25519_SK);
  if (!skHex) throw new Error("Device signing key not found in secure storage");

  const sk = hexToBytes(skHex);
  const signature = nacl.sign.detached(msgBytes, sk);
  return bytesToHex(signature);
}
