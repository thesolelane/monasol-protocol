/**
 * Background task definition for Neighborhood Watch on-chain monitoring.
 *
 * This module must be imported before any React component mounts so that
 * TaskManager.defineTask() is called at module initialisation time. Import it
 * at the top of _layout.tsx before the provider tree is rendered.
 *
 * Background execution notes:
 * - iOS: minimum fetch interval is ~15 minutes; the OS controls actual cadence.
 * - Android: WorkManager respects the requested interval more closely.
 * - Expo Go: Background fetch is NOT supported in the Expo Go development
 *   client. Background monitoring only works in production (EAS Build) apps.
 *   Foreground polling (setInterval in WatcherContext) runs regardless.
 *
 * Security model:
 * - ACTIVE nodes: each observation from GET /activity/:address is signed with
 *   the device Ed25519 private key and submitted to POST /report. Signing uses
 *   the same canonical message format as the foreground loop so that the server
 *   can verify without special-casing the source.
 * - PENDING nodes: observations are collected (to feed the local Activity feed
 *   on next foreground resume) but NOT submitted as reports, because the
 *   verification window has not yet closed.
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import nacl from "tweetnacl";

export const BACKGROUND_FETCH_TASK = "nw-bg-poll";
export const BG_FETCH_MIN_INTERVAL = 5 * 60; // 300s; iOS rounds up to ~15 min

const SK_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

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
 * Increment the nonce counter from SecureStore.
 * Uses the same key ("nw_nonce") as the foreground monitoring loop to maintain
 * a single monotonic nonce stream — duplicate nonces would cause replay rejection.
 */
async function bgIncrementNonce(): Promise<number> {
  const stored = await SecureStore.getItemAsync("nw_nonce");
  const next = (parseInt(stored || "0", 10) || 0) + 1;
  await SecureStore.setItemAsync("nw_nonce", String(next));
  return next;
}

interface BgObservation {
  id: string;
  type: string;
  lockerId: string;
  timestamp: number;
  severity: number;
}

/**
 * Build the Ed25519 canonical message for a report.
 * Must match server-side verification exactly:
 *   report:<wallet>:<locker>:<alertType>:<severity>:<nonce>:<timestamp>
 */
function buildReportMessage(
  walletAddress: string,
  lockerAddress: string,
  alertType: string,
  severity: number,
  nonce: number,
  timestamp: number,
): Uint8Array {
  const canonical = `report:${walletAddress}:${lockerAddress}:${alertType}:${severity}:${nonce}:${timestamp}`;
  return new TextEncoder().encode(canonical);
}

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const walletAddress = await SecureStore.getItemAsync("nw_wallet");
    const nodeStatus    = await SecureStore.getItemAsync("nw_status");
    const domain        = process.env.EXPO_PUBLIC_DOMAIN;

    if (!walletAddress || !domain) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const baseUrl = `https://${domain}`;

    // Fetch real on-chain observations from the server
    const res = await fetch(
      `${baseUrl}/api/watch/activity/${encodeURIComponent(walletAddress)}`,
    );
    if (!res.ok) return BackgroundFetch.BackgroundFetchResult.Failed;

    const data = (await res.json()) as { observations?: BgObservation[] };
    const observations = data.observations ?? [];

    if (observations.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // PENDING nodes: display observations locally — do NOT submit reports.
    // Eligibility has not yet been confirmed; only ACTIVE nodes may report.
    if (nodeStatus !== "ACTIVE") {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    // ACTIVE nodes: sign each observation and submit to POST /api/watch/report.
    const skHex = await SecureStore.getItemAsync("nw_ed25519_sk", SK_OPTIONS);
    if (!skHex) {
      // Key missing — still mark NewData so the foreground loop can handle it
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    const sk = hexToBytes(skHex);

    for (const obs of observations) {
      try {
        const nonce = await bgIncrementNonce();
        const ts    = Date.now();
        const msgBytes = buildReportMessage(
          walletAddress, obs.lockerId, obs.type, obs.severity, nonce, ts,
        );
        const sigBytes = nacl.sign.detached(msgBytes, sk);
        const sig = bytesToHex(sigBytes);

        await fetch(`${baseUrl}/api/watch/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress,
            lockerAddress: obs.lockerId,
            alertType:     obs.type,
            severity:      obs.severity,
            nonce:         String(nonce),
            timestamp:     ts,
            signature:     sig,
          }),
        });
      } catch {
        // Report submission failure — continue with remaining observations
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});
