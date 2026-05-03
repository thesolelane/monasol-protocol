const FLAGS_KEY = "monasol_feature_flags";
const ADMIN_SESSION_KEY = "nw_admin_session";

interface FeatureFlags {
  monadWalletEnabled: boolean;
  neighborhoodWatchEnabled: boolean;
  mslTokenAddressSolana: string;
  mslTokenAddressMonad: string;
  mprotocolFollowCheckEnabled: boolean;
}

const DEFAULTS: FeatureFlags = {
  monadWalletEnabled: false,
  neighborhoodWatchEnabled: false,
  mslTokenAddressSolana: "",
  mslTokenAddressMonad: "",
  mprotocolFollowCheckEnabled: false,
};

export function getFeatureFlags(): FeatureFlags {
  try {
    const stored = localStorage.getItem(FLAGS_KEY);
    if (!stored) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setFeatureFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  const current = getFeatureFlags();
  localStorage.setItem(FLAGS_KEY, JSON.stringify({ ...current, [key]: value }));
  window.dispatchEvent(new CustomEvent("featureFlagsChanged"));
}

export function mergeServerFlags(flags: Partial<FeatureFlags>): void {
  const current = getFeatureFlags();
  localStorage.setItem(FLAGS_KEY, JSON.stringify({ ...current, ...flags }));
  window.dispatchEvent(new CustomEvent("featureFlagsChanged"));
}

function getAdminToken(): string | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token: string; expiresAt: number };
    return Date.now() < parsed.expiresAt ? parsed.token : null;
  } catch {
    return null;
  }
}

export async function loadFlagsFromServer(): Promise<void> {
  try {
    const res = await fetch("/api/watch/public-flags");
    if (!res.ok) return;
    const data = await res.json() as Partial<FeatureFlags>;
    mergeServerFlags(data);
  } catch {
    // Network unavailable — keep localStorage values
  }
}

export async function pushFlagToServer(
  patch: Partial<FeatureFlags>,
  adminToken?: string | null,
): Promise<boolean> {
  const token = adminToken ?? getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/watch/flags", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}
