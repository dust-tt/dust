import config from "@app/lib/api/config";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import type { Dispatcher, RequestInfo, RequestInit, Response } from "undici";
import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

// Undici 8 changed two defaults. We keep the Undici 7 behavior until we roll them out on purpose:
// - `allowH2: false`: use HTTP/1.1, even with servers that offer HTTP/2.
// - `proxyTunnel: true`: reach plain `http://` URLs through a CONNECT tunnel, as for `https://`.
/**
 * @cc [owner:philipperolet,label:performance] http1-and-connect
 * The returned agent MUST use HTTP/1.1 and MUST send every request, including plain `http://`
 * ones, through a CONNECT tunnel to the proxy.
 */
export function createProxyAgent(proxyUrl: string): ProxyAgent {
  return new ProxyAgent({ uri: proxyUrl, allowH2: false, proxyTunnel: true });
}

// Replaces Undici's default agent, which uses HTTP/2 since Undici 8. See `createProxyAgent`.
const http1Agent = new Agent({ allowH2: false });

export function getUntrustedEgressAgent(): ProxyAgent | undefined {
  const proxyHost = config.getUntrustedEgressProxyHost();
  const proxyPort = config.getUntrustedEgressProxyPort();

  if (proxyHost && proxyPort) {
    return createProxyAgent(`http://${proxyHost}:${proxyPort}`);
  }

  return undefined;
}

/**
 * Get a proxy agent for static IP egress.
 * Used for MCP requests to domains that require whitelisted IP addresses.
 * Requires PROXY_USER_NAME, PROXY_USER_PASSWORD, PROXY_HOST, and PROXY_PORT
 * environment variables to be configured.
 */
export function getStaticIPProxyAgent(): ProxyAgent | undefined {
  const user = EnvironmentConfig.getEnvVariable("PROXY_USER_NAME");
  const pass = EnvironmentConfig.getEnvVariable("PROXY_USER_PASSWORD");
  const host = EnvironmentConfig.getEnvVariable("PROXY_HOST");
  const port = EnvironmentConfig.getEnvVariable("PROXY_PORT");

  if (user && pass && host && port) {
    return createProxyAgent(`http://${user}:${pass}@${host}:${port}`);
  }

  return undefined;
}

// Fetch helper that automatically routes outbound requests through the untrusted egress proxy
// when configured. If the proxy is not configured, it falls back to a direct fetch.
export function untrustedFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const dispatcher = getUntrustedEgressAgent();
  const finalInit: RequestInit | undefined = dispatcher
    ? { ...(init ?? {}), dispatcher }
    : init;
  return undiciFetch(input, finalInit);
}

/**
 * Creates a fetch function that routes all requests through the given dispatcher.
 *
 * Used by MCP transports: the MCP SDK does NOT forward `requestInit.dispatcher`
 * to its internal EventSource/GET connections. Passing this as `opts.fetch`
 * ensures ALL fetch calls (SSE GET + POST) go through the dispatcher.
 */
export function createProxyFetch(
  agent: Dispatcher
): (
  input: string | URL,
  init?: globalThis.RequestInit
) => Promise<globalThis.Response> {
  const proxyInit = { dispatcher: agent };
  return async (input, init) => {
    // @ts-expect-error - globalThis.RequestInit and undici.RequestInit are structurally
    // compatible at runtime; the mismatch is only that DOM RequestInit lacks `dispatcher`.
    const response = await undiciFetch(input, { ...init, ...proxyInit });
    return toGlobalResponse(response);
  };
}

/**
 * Wraps an undici Response in a globalThis.Response.
 *
 * undici's fetch returns its own Response class that is structurally compatible
 * with the Web API Response but fails `instanceof globalThis.Response` checks.
 * The MCP SDK relies on `instanceof Response` in parseErrorResponse(), so any
 * fetch function passed to the SDK must return the global variant.
 */
export function toGlobalResponse(r: Response): globalThis.Response {
  // @ts-expect-error - undici's ReadableStream and globalThis.ReadableStream are
  // structurally identical at runtime but TypeScript treats them as distinct types.
  return new globalThis.Response(r.body, {
    status: r.status,
    statusText: r.statusText,
    headers: Object.fromEntries(r.headers.entries()),
  });
}

// Fetch helper for providers that whitelist our egress IPs. Routes outbound requests through the
// static-IP proxy when PROXY_* env vars are set (always the case in deployed environments), and
// falls back to a direct fetch otherwise (local development).
export function staticIpFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const user = EnvironmentConfig.getOptionalEnvVariable("PROXY_USER_NAME");
  const pass = EnvironmentConfig.getOptionalEnvVariable("PROXY_USER_PASSWORD");
  const host = EnvironmentConfig.getOptionalEnvVariable("PROXY_HOST");
  const port = EnvironmentConfig.getOptionalEnvVariable("PROXY_PORT");

  const dispatcher =
    user && pass && host && port
      ? createProxyAgent(`http://${user}:${pass}@${host}:${port}`)
      : http1Agent;
  return undiciFetch(input, { ...init, dispatcher });
}

// Fetch helper for trusted, first‑party egress or intra‑VPC calls.
// This is just the regular fetch without any proxy injection.
export function trustedFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  return undiciFetch(input, { ...init, dispatcher: http1Agent });
}
