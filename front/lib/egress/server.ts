import config from "@app/lib/api/config";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import type { RequestInfo, RequestInit, Response } from "undici";
import { ProxyAgent, fetch as undiciFetch } from "undici";

export function getUntrustedEgressAgent(): ProxyAgent | undefined {
  const proxyHost = config.getUntrustedEgressProxyHost();
  const proxyPort = config.getUntrustedEgressProxyPort();

  if (proxyHost && proxyPort) {
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;
    return new ProxyAgent(proxyUrl);
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
    const proxyUrl = `http://${user}:${pass}@${host}:${port}`;
    return new ProxyAgent(proxyUrl);
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
 * Creates a fetch function that routes all requests through the given proxy agent.
 *
 * Used by MCP transports: the MCP SDK does NOT forward `requestInit.dispatcher`
 * to its internal EventSource/GET connections. Passing this as `opts.fetch`
 * ensures ALL fetch calls (SSE GET + POST) go through the proxy.
 *
 * Node.js 22+ global fetch IS undici under the hood and reads `dispatcher`
 * from the init object at runtime, even though the DOM TS types don't
 * declare it. Using globalThis.fetch keeps the types in DOM-land, which
 * is compatible with the MCP SDK's FetchLike type.
 */
export function createProxyFetch(
  agent: ProxyAgent
): (
  input: string | URL,
  init?: globalThis.RequestInit
) => Promise<globalThis.Response> {
  // Capture dispatcher in a plain object so it can be spread into init
  // without triggering excess-property checks.
  const proxyInit = { dispatcher: agent };
  return (input, init) => globalThis.fetch(input, { ...init, ...proxyInit });
}

// Fetch helper for trusted, first‑party egress or intra‑VPC calls.
// This is just the regular fetch without any proxy injection.
export function trustedFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  return undiciFetch(input, init);
}
