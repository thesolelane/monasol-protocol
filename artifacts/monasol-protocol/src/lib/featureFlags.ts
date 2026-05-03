const FLAGS_KEY = "monasol_feature_flags";

interface FeatureFlags {
  monadWalletEnabled: boolean;
  neighborhoodWatchEnabled: boolean;
  mslTokenAddress: string;
}

const DEFAULTS: FeatureFlags = {
  monadWalletEnabled: false,
  neighborhoodWatchEnabled: false,
  mslTokenAddress: "",
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
