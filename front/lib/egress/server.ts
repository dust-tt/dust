import type { RequestInfo, RequestInit, Response } from "undici";
import { fetch as undiciFetch, ProxyAgent } from "undici";

import config from "@app/lib/api/config";

export function getUntrustedEgressAgent(): ProxyAgent | undefined {
  const proxyHost = config.getUntrustedEgressProxyHost();
  const proxyPort = config.getUntrustedEgressProxyPort();

  if (proxyHost && proxyPort) {
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;
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

// Fetch helper for trusted, first‑party egress or intra‑VPC calls.
// This is just the regular fetch without any proxy injection.
export function trustedFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  return undiciFetch(input, init);
}
