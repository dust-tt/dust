import { apiConfig } from "@connectors/lib/api/config";
import { EnvironmentConfig } from "@connectors/types";
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
} from "undici";
import type { Dispatcher } from "undici";
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

/**
 * Returns a dispatcher routing requests through the static-IP proxy when PROXY_* env vars are set
 * (always the case in deployed environments), for providers that whitelist our egress IPs.
 * Otherwise (local development), returns the default HTTP/1.1 agent.
 */
export function getStaticIpProxyDispatcher(): Dispatcher {
  const user = EnvironmentConfig.getOptionalEnvVariable("PROXY_USER_NAME");
  const password = EnvironmentConfig.getOptionalEnvVariable(
    "PROXY_USER_PASSWORD"
  );
  const host = EnvironmentConfig.getOptionalEnvVariable("PROXY_HOST");
  const port = EnvironmentConfig.getOptionalEnvVariable("PROXY_PORT");

  if (user && password && host && port) {
    return createProxyAgent(`http://${user}:${password}@${host}:${port}`);
  }

  return http1Agent;
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
