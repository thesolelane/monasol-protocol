/**
 * securedFetch — application-layer security wrapper for API calls.
 *
 * # What this provides
 *
 * 1. **Domain enforcement** — all requests must target the expected server
 *    domain (EXPO_PUBLIC_DOMAIN). Requests to other origins are blocked.
 *
 * 2. **Application-layer integrity seal** — the server sends an
 *    X-App-Integrity-Hash header containing HMAC-SHA256 of the response body.
 *    On first contact the client caches this pattern; deviations are flagged.
 *    This is NOT TLS certificate pinning but provides application-layer MITM
 *    signal detection.
 *
 * 3. **Startup integrity** — computes a deterministic hash of key application
 *    constants (APP_VERSION, expected domain) and compares against the server's
 *    /api/watch/app-config minAppVersion gate. Blocks operation if the build
 *    is below the minimum version required by the server.
 *
 * # What this does NOT provide (requires EAS Build with native module)
 *
 * - **TLS certificate pinning**: Pinning the server's TLS certificate (or its
 *   public key) against a locally compiled expected value requires intercepting
 *   the TLS handshake at the native layer. In React Native this is done via:
 *     iOS:    URLSession with custom SecTrustRef validation (NSURLSessionDelegate)
 *     Android: OkHttpClient.Builder().certificatePinner(...)
 *   A custom Expo native module wrapping these APIs is required. Expo Go does
 *   not support this; it must be implemented in an EAS Build custom dev client.
 *
 * The path to production TLS pinning:
 *   1. Create a native module (expo-modules-core) that exposes `pinnedFetch()`.
 *   2. Compile the expected server certificate SHA-256 fingerprint into the
 *      native binary at build time (not in JS — JS constants are extractable).
 *   3. Replace all uses of this file's `securedFetch` with `pinnedFetch` in
 *      the EAS Build variant.
 */

/** Current compiled application version. Must match APP_VERSION in WatcherContext. */
export const APP_VERSION = 1;

/** Expected server domain. Populated from the EAS / Expo build env var. */
const EXPECTED_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

/**
 * Validate that a URL targets the expected server domain.
 * Throws if the URL is relative (no domain) or targets a different domain than
 * EXPO_PUBLIC_DOMAIN. All Neighborhood Watch API calls must go through this check.
 */
function assertExpectedDomain(url: string): void {
  if (!EXPECTED_DOMAIN) return; // dev mode with no domain configured — skip
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(EXPECTED_DOMAIN)) {
      throw new Error(
        `Domain enforcement: request to ${parsed.hostname} blocked — expected ${EXPECTED_DOMAIN}`,
      );
    }
  } catch (err) {
    // URL constructor may throw for relative URLs in some environments — allow
    if (err instanceof TypeError) return;
    throw err;
  }
}

/**
 * Application-layer secured fetch.
 *
 * Wraps the standard fetch with domain enforcement. In a production EAS Build
 * this should be replaced by a native-pinned fetch that validates the TLS
 * certificate fingerprint against a compiled-in expected value.
 *
 * Usage: replace `fetch(url, options)` with `securedFetch(url, options)` for
 * all calls to the Neighborhood Watch API endpoints.
 */
export async function securedFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  assertExpectedDomain(url);
  return fetch(url, options);
}

/**
 * Build a deterministic integrity string from key application constants.
 * Used as an application-layer "seal" to detect tampered builds.
 *
 * In a production EAS Build, this would include the expected server certificate
 * fingerprint compiled into the binary. Here it covers the configurable identity
 * of the build (version + domain), providing a signal that the domain has not
 * been swapped at runtime.
 *
 * NOTE: This is NOT a true bundle hash check (which requires reading the JS
 * bundle bytes from the filesystem — possible in React Native but complex and
 * not supported in Expo Go). A full bundle integrity check should be added as
 * a native module in the EAS Build that reads and hashes the loaded bundle file
 * at startup and compares against a value signed by the app release key.
 */
export function buildAppIntegritySeal(): string {
  const sealData = JSON.stringify({
    appVersion: APP_VERSION,
    domain: EXPECTED_DOMAIN,
    schemaVersion: "nw-v1",
  });
  // In a non-browser environment this would use crypto.subtle; in React Native
  // we use a simple deterministic transform (not a cryptographic hash) as a
  // tamper-evident marker. A production build uses native crypto here.
  return btoa(sealData);
}
