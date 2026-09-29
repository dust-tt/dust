import { Agent, interceptors, fetch as undiciFetch } from "undici";

const { dns, retry } = interceptors;

// A pod rollout leaves at most one dead socket per connection; one retry is enough, two is margin.
const RETRY_MAX_ATTEMPTS = 2;
const RETRY_MIN_TIMEOUT_MS = 200;

// Shared agent for calls to internal services (CoreAPI, OAuthAPI).
// - keepAlive: reuses TCP connections; both servers (Axum/Hyper) have no server-side idle
//   timeout so 30s is safe. The client always closes first.
// - dns: caches DNS resolutions to avoid repeated dns.lookup() calls that saturate the
//   libuv thread pool and drive up event loop utilisation.
// - retry: retries idempotent methods on transport errors only (ECONNREFUSED, ECONNRESET,
//   UND_ERR_SOCKET, ...), never on HTTP status. Covers a pod closing its keep-alive
//   sockets on SIGTERM, which endpoint removal does not protect against.
export const internalAgent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 600_000,
}).compose(
  dns({
    maxTTL: 30_000, // 30 s, safe for internal K8s services.
    dualStack: false, // infra is IPv4-only.
  }),
  retry({
    maxRetries: RETRY_MAX_ATTEMPTS,
    minTimeout: RETRY_MIN_TIMEOUT_MS,
    statusCodes: [],
  })
);

export function internalFetch(
  url: string | URL,
  init?: globalThis.RequestInit
): Promise<globalThis.Response> {
  // @ts-expect-error - globalThis.RequestInit and undici.RequestInit are structurally
  // compatible at runtime; the mismatch is only that DOM RequestInit lacks `dispatcher`.
  return undiciFetch(url, { ...(init ?? {}), dispatcher: internalAgent });
}
