import { Agent, interceptors, fetch as undiciFetch } from "undici";

const { dns, retry } = interceptors;

// One dead keep-alive socket per terminated pod, so one retry is enough; two is margin.
const MAX_RETRIES = 2;
const RETRY_MIN_TIMEOUT_MS = 200;

// Shared agent for calls to internal services (CoreAPI, OAuthAPI, in-cluster MCP servers).
// - keepAlive: reuses TCP connections; both servers (Axum/Hyper) have no server-side idle
//   timeout so 30s is safe. A pod closes its sockets on SIGTERM, see the retry below.
// - dns: caches DNS resolutions to avoid repeated dns.lookup() calls that saturate the
//   libuv thread pool and drive up event loop utilisation.
export const internalAgent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 600_000,
}).compose(
  dns({
    maxTTL: 30_000, // 30 s, safe for internal K8s services.
    dualStack: false, // infra is IPv4-only.
  })
);

// Request/response calls only: retries idempotent methods on transport errors (ECONNREFUSED,
// ECONNRESET, UND_ERR_SOCKET, ...), never on HTTP status. Kept off `internalAgent` so the MCP
// SSE transports that share it are not retried mid-stream.
// undici calls the last composed interceptor first, so each retry goes back through the DNS cache.
const internalFetchAgent = internalAgent.compose(
  retry({
    maxRetries: MAX_RETRIES,
    minTimeout: RETRY_MIN_TIMEOUT_MS,
    statusCodes: [], // Transport errors only.
  })
);

export function internalFetch(
  url: string | URL,
  init?: globalThis.RequestInit
): Promise<globalThis.Response> {
  // @ts-expect-error - globalThis.RequestInit and undici.RequestInit are structurally
  // compatible at runtime; the mismatch is only that DOM RequestInit lacks `dispatcher`.
  return undiciFetch(url, { ...(init ?? {}), dispatcher: internalFetchAgent });
}
