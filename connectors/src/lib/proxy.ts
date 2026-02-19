import { apiConfig } from "@connectors/lib/api/config";
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
} from "undici";
import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * Creates a fetch function with proxy support if configured.
 * If UNTRUSTED_EGRESS_PROXY_HOST and UNTRUSTED_EGRESS_PROXY_PORT are set,
 * returns undici's fetch with proxy configuration.
 * Otherwise, returns the standard global fetch.
 */
export function createProxyAwareFetch() {
  const proxyHost = apiConfig.getUntrustedEgressProxyHost();
  const proxyPort = apiConfig.getUntrustedEgressProxyPort();

  if (proxyHost && proxyPort) {
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;
    const dispatcher = new ProxyAgent(proxyUrl);

    return (input: UndiciRequestInfo, init?: UndiciRequestInit) => {
      return undiciFetch(input, { ...init, dispatcher });
    };
  }

  // If no proxy configured, use standard fetch
  return fetch;
}
