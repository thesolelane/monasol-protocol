const getBaseUrl = () => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
};

export interface RegisterNodeInput {
  walletAddress: string;
  chain: "solana" | "monad";
  xHandle: string;
  telegramHandle: string;
  discordHandle: string;
  devicePublicKey: string;
}

export interface NodeStatusResponse {
  status: string;
  tier: number;
  rejectionReason?: string;
  verificationDue: number;
  registeredAt: number;
  nextRecheckAt?: number;
  uptimeSeconds: number;
  reportCount: number;
  lockerCount: number;
  estimatedRewards: number;
  xHandle?: string;
  telegramHandle?: string;
  discordHandle?: string;
}

export interface RegisterNodeResponse {
  registeredAt: number;
  verificationDue: number;
  message: string;
}

export async function registerNode(
  data: RegisterNodeInput,
): Promise<RegisterNodeResponse> {
  const res = await fetch(`${getBaseUrl()}/api/watch/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Registration failed" }));
    throw new Error(err.error || "Registration failed");
  }
  return res.json();
}

export async function getNodeStatus(
  walletAddress: string,
): Promise<NodeStatusResponse> {
  const res = await fetch(
    `${getBaseUrl()}/api/watch/status/${walletAddress}`,
  );
  if (!res.ok) {
    throw new Error("Failed to fetch status");
  }
  return res.json();
}

/**
 * Get a single-use challenge nonce for device key rotation.
 * The caller must sign `rotate:<challenge>:<newPublicKey>` with the CURRENT
 * Ed25519 private key and submit the result to rotateDeviceKey().
 */
export async function getRotationChallenge(
  walletAddress: string,
): Promise<{ challenge: string; expiresAt: number }> {
  const res = await fetch(
    `${getBaseUrl()}/api/watch/device/challenge?wallet=${encodeURIComponent(walletAddress)}`,
  );
  if (!res.ok) throw new Error("Failed to get rotation challenge");
  return res.json();
}

export interface RotateDeviceKeyInput {
  walletAddress: string;
  newPublicKey: string;
  challenge: string;
  /** Ed25519 signature of "rotate:<challenge>:<newPublicKey>" using the OLD private key. */
  rotationSignature: string;
}

export async function rotateDeviceKey(
  data: RotateDeviceKeyInput,
): Promise<{ success: boolean }> {
  const res = await fetch(`${getBaseUrl()}/api/watch/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Key rotation failed" }));
    throw new Error(err.error || "Key rotation failed");
  }
  return res.json();
}

export interface ReportInput {
  walletAddress: string;
  lockerAddress: string;
  alertType: string;
  severity: number;
  nonce: string;
  timestamp: number;
  /**
   * Ed25519 detached signature (hex, 128 chars) of the canonical message:
   *   report:<walletAddress>:<lockerAddress>:<alertType>:<severity>:<nonce>:<timestamp>
   * Signed with the device Ed25519 private key registered at node creation.
   */
  signature: string;
}

export async function submitReport(
  data: ReportInput,
): Promise<{ success: boolean; reportCount: number }> {
  const res = await fetch(`${getBaseUrl()}/api/watch/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Report failed" }));
    throw new Error(err.error || "Report submission failed");
  }
  return res.json();
}

export interface ActivityObservation {
  id: string;
  type: string;
  lockerId: string;
  timestamp: number;
  severity: number;
}

/**
 * Fetch on-chain observations for a wallet from the server.
 *
 * The server makes read-only RPC calls to Solana or Monad, derives typed
 * anomaly events from real transaction data (failed txs, large outflows,
 * token transfers, low balance, unusual instruction patterns), and returns
 * them here. No observations are generated on the client side.
 */
export async function getWalletActivity(
  walletAddress: string,
): Promise<ActivityObservation[]> {
  const res = await fetch(
    `${getBaseUrl()}/api/watch/activity/${encodeURIComponent(walletAddress)}`,
  );
  if (!res.ok) {
    // Non-fatal: return empty list on any error
    return [];
  }
  const data = (await res.json()) as { observations?: ActivityObservation[] };
  return data.observations ?? [];
}
