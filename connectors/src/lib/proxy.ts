import { apiConfig } from "@connectors/lib/api/config";
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
} from "undici";
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
export const http1Agent = new Agent({ allowH2: false });

// Static IP proxy URL when `PROXY_*` env vars are configured (always the case in deployed
// environments), for providers that whitelist our egress IPs.
export function getStaticIpProxyUrl(): string | undefined {
  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;
  const user = process.env.PROXY_USER_NAME;
  const password = process.env.PROXY_USER_PASSWORD;

  if (!host || !port || !user || !password) {
    return undefined;
  }

  return `http://${user}:${password}@${host}:${port}`;
}

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
    const dispatcher = createProxyAgent(`http://${proxyHost}:${proxyPort}`);

    return (input: UndiciRequestInfo, init?: UndiciRequestInit) => {
      return undiciFetch(input, { ...init, dispatcher });
    };
  }

  // If no proxy configured, use standard fetch
  return fetch;
}
