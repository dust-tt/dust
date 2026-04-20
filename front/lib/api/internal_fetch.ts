import { Agent, interceptors, fetch as undiciFetch } from "undici";

const { dns } = interceptors;

// Shared agent for calls to internal services (CoreAPI, OAuthAPI).
// - keepAlive: reuses TCP connections; both servers (Axum/Hyper) have no server-side idle
//   timeout so 30 s is safe. The client always closes first.
// - dns: caches DNS resolutions to avoid repeated dns.lookup() calls that saturate the
//   libuv thread pool and drive up event loop utilisation.
// - retry: retries on transient network errors; only fires on idempotent methods for 5xx.
const _internalAgent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 600_000,
}).compose(
  dns({
    maxTTL: 30_000, // 30 s, safe for internal K8s services.
    dualStack: false, // infra is IPv4-only.
  })
);

export function internalFetch(
  url: string | URL,
  init?: globalThis.RequestInit
): Promise<globalThis.Response> {
  // @ts-expect-error - globalThis.RequestInit and undici.RequestInit are structurally
  // compatible at runtime; the mismatch is only that DOM RequestInit lacks `dispatcher`.
  return undiciFetch(url, { ...(init ?? {}), dispatcher: _internalAgent });
}
