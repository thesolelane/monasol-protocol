/**
 * WatcherContext — Neighborhood Watch node state and monitoring.
 *
 * Monitoring model:
 * - Observations come from GET /api/watch/activity/:address on the server,
 *   which makes read-only RPC calls to Solana/Monad and derives typed
 *   anomaly events from real on-chain data (balance changes, failed txs,
 *   large outflows, token transfers). No synthetic/random data is generated.
 * - While the app is in the foreground, polling runs every 5 minutes via
 *   setInterval.
 * - While the app is in the background, expo-background-fetch drives polling
 *   (Expo Go doesn't support background execution; use an EAS Build for that).
 * - Each detected observation is signed with the Ed25519 private key and
 *   submitted to POST /api/watch/report.
 */

import nacl from "tweetnacl";
import * as Crypto from "expo-crypto";
import * as BackgroundFetch from "expo-background-fetch";
import * as Device from "expo-device";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  STORAGE_KEYS,
  incrementNonce,
  secureDelete,
  secureGet,
  secureGetSk,
  secureSet,
  secureSetSk,
} from "@/utils/secureStorage";
import {
  BACKGROUND_FETCH_TASK,
  BG_FETCH_MIN_INTERVAL,
} from "@/utils/backgroundTask";
import {
  type RegisterNodeInput,
  getNodeStatus,
  getWalletActivity,
  registerNode,
  submitReport,
  sendPing,
} from "@/utils/api";

export type NodeStatus =
  | "LOADING"
  | "UNREGISTERED"
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "DEACTIVATED";

export interface Observation {
  id: string;
  type: string;
  lockerId: string;
  timestamp: number;
  severity: number;
}

export interface WatcherState {
  walletAddress: string;
  chain: "solana" | "monad";
  xHandle: string;
  telegramHandle: string;
  discordHandle: string;
  tier: 1 | 2;
  registeredAt: number;
  verificationDue: number;
  uptimeSeconds: number;
  reportCount: number;
  lockerCount: number;
  estimatedRewards: number;
  onChainPingCount: number;
  rejectionReason?: string;
}

interface WatcherContextValue {
  status: NodeStatus;
  node: WatcherState | null;
  observations: Observation[];
  /**
   * Ed25519 public key hex — safe to display.
   * The 64-byte private key never leaves SecureStore.
   */
  devicePublicKey: string | null;
  /**
   * Result of jailbreak/root detection via expo-device.
   * null = detection not yet complete.
   * true = device is likely rooted/jailbroken.
   * false = no signs detected (not a guarantee).
   */
  isRooted: boolean | null;
  isRefreshing: boolean;
  register: (data: Omit<RegisterNodeInput, "devicePublicKey">) => Promise<void>;
  refreshStatus: () => Promise<void>;
  resubmit: () => Promise<void>;
}

const WatcherContext = createContext<WatcherContextValue | null>(null);

// ─── Key utilities ─────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate an Ed25519 key pair using a cryptographically secure 32-byte seed
 * from expo-crypto. The 64-byte secretKey is stored in SecureStore with
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY. The 32-byte publicKey is registered.
 */
async function generateEd25519KeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const seedBytes = await Crypto.getRandomBytesAsync(32);
  const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(seedBytes));
  return {
    privateKey: bytesToHex(keyPair.secretKey),
    publicKey:  bytesToHex(keyPair.publicKey),
  };
}

/**
 * Produce an Ed25519 detached signature for a report payload.
 *
 * Canonical message (must match server exactly):
 *   report:<walletAddress>:<lockerAddress>:<alertType>:<severity>:<nonce>:<timestamp>
 *
 * Security properties:
 * - Authenticity: only the device holding secretKey can produce a valid sig.
 * - Integrity: signature covers all report fields; tampering invalidates it.
 * - Non-repudiation: secretKey never leaves SecureStore.
 */
async function signReportEd25519(
  privateKeyHex: string,
  walletAddress: string,
  lockerAddress: string,
  alertType: string,
  severity: number,
  nonce: string,
  timestamp: number,
): Promise<string> {
  const canonical = `report:${walletAddress}:${lockerAddress}:${alertType}:${severity}:${nonce}:${timestamp}`;
  const msgBytes = new TextEncoder().encode(canonical);
  const skBytes  = hexToBytes(privateKeyHex);
  const signature = nacl.sign.detached(msgBytes, skBytes);
  return bytesToHex(signature);
}

// ─── Provider ──────────────────────────────────────────────────────────────

/**
 * Current compiled app version. Bump this whenever a breaking security change
 * is deployed. The server's /api/watch/app-config endpoint exposes minAppVersion;
 * if APP_VERSION < minAppVersion the app refuses to operate (forced update gate).
 */
const APP_VERSION = 1;

export function WatcherProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus]               = useState<NodeStatus>("LOADING");
  const [node, setNode]                   = useState<WatcherState | null>(null);
  const [observations, setObservations]   = useState<Observation[]>([]);
  const [devicePublicKey, setDevicePublicKey] = useState<string | null>(null);
  const [isRooted, setIsRooted]           = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const pollingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const monitorRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef   = useRef<NodeStatus | null>(null);

  useEffect(() => {
    loadState();
    detectRootedDevice();
    registerBackgroundTask();
  }, []);

  // ── Pending-backlog discard on PENDING → ACTIVE transition ──────────────
  /**
   * When the server confirms the node has moved from PENDING to ACTIVE:
   *  1. Record the activation timestamp in SecureStore (ACTIVATED_AT).
   *     This timestamp is the hard replay-prevention boundary: any observation
   *     with timestamp < activatedAt MUST NOT be submitted as a report, even
   *     if the app restarts between the transition and the next monitoring tick.
   *  2. Clear the in-memory observation list so the Activity feed starts fresh.
   *
   * The ACTIVATED_AT boundary also protects against re-surfaced observations:
   * if the server returns the same observation IDs after activation (e.g. if
   * RPC returns the same recent-tx data), the monitoring loop checks timestamps
   * against activatedAt before submitting, preventing retroactive report submission.
   */
  useEffect(() => {
    if (prevStatusRef.current === "PENDING" && status === "ACTIVE") {
      const activatedAt = Date.now();
      // Persist so the boundary survives app restarts
      secureSet(STORAGE_KEYS.ACTIVATED_AT, String(activatedAt));
      setObservations([]);
    }
    prevStatusRef.current = status;
  }, [status]);

  // ── Jailbreak / root detection (expo-device) ────────────────────────────
  const detectRootedDevice = async () => {
    try {
      const rooted = await Device.isRootedExperimentalAsync();
      setIsRooted(rooted);
    } catch {
      setIsRooted(false);
    }
  };

  // ── Background fetch registration ───────────────────────────────────────
  const registerBackgroundTask = async () => {
    try {
      const status = await BackgroundFetch.getStatusAsync();
      if (
        status === BackgroundFetch.BackgroundFetchStatus.Available ||
        status === BackgroundFetch.BackgroundFetchStatus.Restricted
      ) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
          minimumInterval: BG_FETCH_MIN_INTERVAL,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
      // If Denied or unavailable (Expo Go), background fetch won't run.
      // Foreground polling via setInterval still works.
    } catch {
      // Background fetch registration failed — foreground polling continues.
    }
  };

  // ── Key pair initialisation + stored state load ─────────────────────────
  const loadState = async () => {
    try {
      // ── Startup integrity check ──────────────────────────────────────────
      // Fetch the server's app-config to enforce a forced-update gate.
      // If minAppVersion > APP_VERSION the app is blocked from operating.
      // This provides a server-controlled kill-switch for compromised builds.
      // Non-fatal: if the server is unreachable we continue (offline tolerance).
      try {
        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        if (domain) {
          const configRes = await fetch(`https://${domain}/api/watch/app-config`);
          if (configRes.ok) {
            const config = (await configRes.json()) as { minAppVersion: number };
            if (typeof config.minAppVersion === "number" && config.minAppVersion > APP_VERSION) {
              // This build is below the minimum — block startup and show update prompt.
              // In a production EAS build this would deep-link to the App Store.
              setStatus("UNREGISTERED");
              return;
            }
          }
        }
      } catch {
        // Offline or server unreachable — proceed with cached state
      }

      let pk = await secureGet(STORAGE_KEYS.ED25519_PK);
      let sk = await secureGetSk(STORAGE_KEYS.ED25519_SK);
      if (!pk || !sk) {
        const pair = await generateEd25519KeyPair();
        sk = pair.privateKey;
        pk = pair.publicKey;
        await secureSetSk(STORAGE_KEYS.ED25519_SK, sk);
        await secureSet(STORAGE_KEYS.ED25519_PK, pk);
      }
      setDevicePublicKey(pk);

      const walletAddress = await secureGet(STORAGE_KEYS.WALLET_ADDRESS);
      if (!walletAddress) {
        setStatus("UNREGISTERED");
        return;
      }

      const nodeStatus      = await secureGet(STORAGE_KEYS.NODE_STATUS);
      const chain           = ((await secureGet(STORAGE_KEYS.CHAIN)) || "solana") as "solana" | "monad";
      const xHandle         = (await secureGet(STORAGE_KEYS.X_HANDLE)) || "";
      const telegramHandle  = (await secureGet(STORAGE_KEYS.TELEGRAM_HANDLE)) || "";
      const discordHandle   = (await secureGet(STORAGE_KEYS.DISCORD_HANDLE)) || "";
      const registeredAt    = parseInt((await secureGet(STORAGE_KEYS.REGISTERED_AT)) || "0", 10);
      const verificationDue = parseInt((await secureGet(STORAGE_KEYS.VERIFICATION_DUE)) || "0", 10);
      const rejectionReason = (await secureGet(STORAGE_KEYS.REJECTION_REASON)) || undefined;
      const tier            = parseInt((await secureGet(STORAGE_KEYS.TIER)) || "1", 10) as 1 | 2;

      setNode({
        walletAddress, chain, xHandle, telegramHandle, discordHandle,
        tier, registeredAt, verificationDue,
        uptimeSeconds: Math.floor((Date.now() - registeredAt) / 1000),
        reportCount: 0, lockerCount: 0, estimatedRewards: 0, onChainPingCount: 0, rejectionReason,
      });

      const resolvedStatus = (nodeStatus as NodeStatus) || "PENDING";
      setStatus(resolvedStatus);

      if (walletAddress && (resolvedStatus === "PENDING" || resolvedStatus === "ACTIVE")) {
        refreshStatusFor(walletAddress);
      }
    } catch {
      setStatus("UNREGISTERED");
    }
  };

  // ── API status refresh ──────────────────────────────────────────────────
  const refreshStatusFor = async (walletAddress: string) => {
    try {
      const data = await getNodeStatus(walletAddress);
      await secureSet(STORAGE_KEYS.NODE_STATUS, data.status);
      await secureSet(STORAGE_KEYS.TIER, String(data.tier));
      if (data.rejectionReason) {
        await secureSet(STORAGE_KEYS.REJECTION_REASON, data.rejectionReason);
      }
      setNode((prev) =>
        prev
          ? {
              ...prev,
              tier: (data.tier as 1 | 2) || 1,
              uptimeSeconds: data.uptimeSeconds,
              reportCount: data.reportCount,
              lockerCount: data.lockerCount,
              estimatedRewards: data.estimatedRewards,
              onChainPingCount: data.onChainPingCount ?? prev.onChainPingCount,
              rejectionReason: data.rejectionReason,
            }
          : null,
      );
      setStatus(data.status as NodeStatus);
    } catch {
      // Keep existing status on transient error
    }
  };

  // ── Status polling: every 30s while PENDING or ACTIVE ──────────────────
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if ((status === "PENDING" || status === "ACTIVE") && node?.walletAddress) {
      pollingRef.current = setInterval(() => {
        refreshStatusFor(node.walletAddress);
      }, 30_000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [status, node?.walletAddress]);

  // ── Uptime counter: update every second ────────────────────────────────
  useEffect(() => {
    if (!node || status === "LOADING" || status === "UNREGISTERED") return;
    const timer = setInterval(() => {
      setNode((prev) =>
        prev
          ? { ...prev, uptimeSeconds: Math.floor((Date.now() - prev.registeredAt) / 1000) }
          : null,
      );
    }, 1_000);
    return () => clearInterval(timer);
  }, [status, node?.registeredAt]);

  // ── On-chain activity polling — PENDING and ACTIVE nodes ───────────────
  /**
   * Foreground monitoring loop (every 5 minutes).
   *
   * On each tick:
   * 1. Poll GET /api/watch/activity/:address — server queries the real RPC
   *    for the watcher's wallet: failed txs (AUTH_FAILURES), large SOL/EVM
   *    outflows (LARGE_OUTFLOW), SPL token transfers (NFT_TRANSFER), low
   *    balance (NODE_HEALTH_LOW), and complex instruction patterns
   *    (UNUSUAL_PATTERN). No synthetic data is generated.
   * 2. ACTIVE only: sign each new observation and submit to POST /api/watch/report.
   *    PENDING: observations are shown locally but NOT submitted as reports,
   *    because PENDING nodes are not yet verified to accept reports.
   *
   * Pending-period intent: the monitoring feed shows the user that their node
   * is watching their wallet in real time during the 48h verification window.
   * Observations accumulated during PENDING are discarded on resubmit.
   *
   * Background monitoring (when app is backgrounded) is handled by the
   * expo-background-fetch task in utils/backgroundTask.ts.
   * Note: Expo Go does NOT execute background tasks — use an EAS Build for
   * production background monitoring at the full 5-minute cadence.
   *
   * Key security note: the Ed25519 private key is stored in the OS Keychain
   * (iOS) / Keystore (Android) via expo-secure-store with
   * WHEN_UNLOCKED_THIS_DEVICE_ONLY. On devices with a hardware security
   * module (Secure Enclave / StrongBox), the key material may be hardware-
   * backed. However, expo-secure-store does NOT guarantee non-exportable
   * key semantics — the raw key bytes can be read back by the JS runtime.
   * For true non-exportable hardware signing (e.g. Secure Enclave ECDSA),
   * a custom Expo native module wrapping SecKeyCreateSignature (iOS) or
   * Android KeyStore KeyPairGenerator with setIsStrongBoxBacked(true) is
   * required. This is out of scope for the managed Expo workflow and should
   * be addressed in a production EAS Build with a native signing module.
   */
  useEffect(() => {
    if (monitorRef.current) clearInterval(monitorRef.current);

    const isMonitoring = status === "ACTIVE" || status === "PENDING";
    if (!isMonitoring || !node?.walletAddress) return;

    const walletAddress = node.walletAddress;
    const isActive      = status === "ACTIVE";

    const monitorStep = async () => {
      let newObs: Observation[] = [];
      try {
        newObs = await getWalletActivity(walletAddress);
      } catch {
        return; // Network or server error — skip this cycle
      }

      if (newObs.length === 0) return;

      setObservations((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        const fresh = newObs.filter((o) => !existingIds.has(o.id));
        return [...fresh, ...prev].slice(0, 100);
      });

      // Only ACTIVE nodes may submit signed reports to the API.
      // PENDING observations are shown in the local feed only.
      if (!isActive) return;

      const sk = await secureGetSk(STORAGE_KEYS.ED25519_SK);
      if (!sk) return;

      // Read the activation boundary: only submit reports for observations that
      // arrived AFTER the node became ACTIVE. Any observation timestamped before
      // activatedAt was collected during the 48h pending window and must not be
      // submitted retroactively — the server would reject PENDING-node reports.
      // This check survives app restarts (boundary stored in SecureStore).
      const activatedAtStr = await secureGet(STORAGE_KEYS.ACTIVATED_AT);
      const activatedAt = activatedAtStr ? parseInt(activatedAtStr, 10) : 0;

      for (const obs of newObs) {
        // Strict pre-activation filter: skip any observation timestamped before
        // the activation boundary. This prevents replay of the pending backlog
        // even if the server re-returns the same recent-event IDs after activation.
        if (obs.timestamp < activatedAt) continue;

        try {
          const nonce = await incrementNonce(STORAGE_KEYS.NONCE);
          const ts    = Date.now();
          const sig   = await signReportEd25519(
            sk, walletAddress, obs.lockerId, obs.type, obs.severity, String(nonce), ts,
          );
          const result = await submitReport({
            walletAddress,
            lockerAddress: obs.lockerId,
            alertType: obs.type,
            severity: obs.severity,
            nonce: String(nonce),
            timestamp: ts,
            signature: sig,
          });
          setNode((prev) => prev ? { ...prev, reportCount: result.reportCount } : null);
        } catch {
          // Rate-limited or network error — observation already shown locally
        }
      }
    };

    // Send an uptime ping every 5 minutes when ACTIVE and Tier 1.
    // Tier 2+ nodes call ping() directly on-chain — no oracle needed.
    // Each ping is Ed25519-signed with the device key to prevent spoofing.
    const tier = node?.tier ?? 1;
    const pingStep = async () => {
      if (!isActive) return;
      if (tier !== 1) return;
      try {
        const sk = await secureGetSk(STORAGE_KEYS.ED25519_SK);
        if (!sk) return;

        const ts = Date.now();
        const canonical = `ping:${walletAddress}:${ts}`;
        const msgBytes  = new TextEncoder().encode(canonical);
        const skBytes   = hexToBytes(sk);
        const sigBytes  = nacl.sign.detached(msgBytes, skBytes);
        const sig       = bytesToHex(sigBytes);

        await sendPing(walletAddress, ts, sig);
        // onChainPingCount is refreshed via refreshStatusFor on the next
        // polling tick (every 30s). No local state mutation needed here.
      } catch {
        // Non-fatal: ping queue is best-effort
      }
    };

    // Run monitor + ping immediately, then every 5 minutes
    monitorStep();
    pingStep();
    monitorRef.current = setInterval(() => {
      monitorStep();
      pingStep();
    }, 5 * 60 * 1000);

    return () => { if (monitorRef.current) clearInterval(monitorRef.current); };
  }, [status, node?.walletAddress]);

  // ── Registration ────────────────────────────────────────────────────────
  const register = useCallback(
    async (data: Omit<RegisterNodeInput, "devicePublicKey">) => {
      let pk = await secureGet(STORAGE_KEYS.ED25519_PK);
      let sk = await secureGetSk(STORAGE_KEYS.ED25519_SK);
      if (!pk || !sk) {
        const pair = await generateEd25519KeyPair();
        sk = pair.privateKey;
        pk = pair.publicKey;
        await secureSetSk(STORAGE_KEYS.ED25519_SK, sk);
        await secureSet(STORAGE_KEYS.ED25519_PK, pk);
        setDevicePublicKey(pk);
      }

      const result = await registerNode({ ...data, devicePublicKey: pk });

      await secureSet(STORAGE_KEYS.WALLET_ADDRESS, data.walletAddress);
      await secureSet(STORAGE_KEYS.CHAIN, data.chain);
      await secureSet(STORAGE_KEYS.X_HANDLE, data.xHandle);
      await secureSet(STORAGE_KEYS.TELEGRAM_HANDLE, data.telegramHandle);
      await secureSet(STORAGE_KEYS.DISCORD_HANDLE, data.discordHandle);
      await secureSet(STORAGE_KEYS.NODE_STATUS, "PENDING");
      await secureSet(STORAGE_KEYS.REGISTERED_AT, String(result.registeredAt));
      await secureSet(STORAGE_KEYS.VERIFICATION_DUE, String(result.verificationDue));
      await secureSet(STORAGE_KEYS.TIER, "1");

      setNode({
        walletAddress: data.walletAddress, chain: data.chain,
        xHandle: data.xHandle, telegramHandle: data.telegramHandle,
        discordHandle: data.discordHandle, tier: 1,
        registeredAt: result.registeredAt, verificationDue: result.verificationDue,
        uptimeSeconds: 0, reportCount: 0, lockerCount: 0, estimatedRewards: 0, onChainPingCount: 0,
      });
      setStatus("PENDING");
    },
    [],
  );

  // ── Status refresh (pull-to-refresh) ────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (!node?.walletAddress) return;
    setIsRefreshing(true);
    try {
      await refreshStatusFor(node.walletAddress);
      if (status === "ACTIVE") {
        const sk = await secureGetSk(STORAGE_KEYS.ED25519_SK);
        if (sk) {
          const newObs = await getWalletActivity(node.walletAddress);
          if (newObs.length > 0) {
            setObservations((prev) => {
              const existingIds = new Set(prev.map((o) => o.id));
              const fresh = newObs.filter((o) => !existingIds.has(o.id));
              return [...fresh, ...prev].slice(0, 100);
            });
          }
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [node?.walletAddress, status]);

  // ── Reset & Resubmit ────────────────────────────────────────────────────
  const resubmit = useCallback(async () => {
    const keysToDelete = [
      STORAGE_KEYS.WALLET_ADDRESS, STORAGE_KEYS.NODE_STATUS, STORAGE_KEYS.REGISTERED_AT,
      STORAGE_KEYS.VERIFICATION_DUE, STORAGE_KEYS.REJECTION_REASON, STORAGE_KEYS.X_HANDLE,
      STORAGE_KEYS.TELEGRAM_HANDLE, STORAGE_KEYS.DISCORD_HANDLE, STORAGE_KEYS.CHAIN,
      STORAGE_KEYS.TIER, STORAGE_KEYS.ED25519_SK, STORAGE_KEYS.ED25519_PK,
    ];
    await Promise.all(keysToDelete.map((k) => secureDelete(k)));
    setDevicePublicKey(null);
    setNode(null);
    setObservations([]);
    setStatus("UNREGISTERED");
  }, []);

  return (
    <WatcherContext.Provider
      value={{ status, node, observations, devicePublicKey, isRooted, isRefreshing, register, refreshStatus, resubmit }}
    >
      {children}
    </WatcherContext.Provider>
  );
}

export function useWatcher() {
  const ctx = useContext(WatcherContext);
  if (!ctx) throw new Error("useWatcher must be used within WatcherProvider");
  return ctx;
}
