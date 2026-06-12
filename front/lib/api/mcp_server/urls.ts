import config from "@app/lib/api/config";
import { isDevelopment } from "@app/types/shared/env";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

/** Flip to disable OAuth proxying in dev (e.g. native MCP clients → AuthKit direct). */
const MCP_OAUTH_PROXY_ENABLED = true;

/**
 * Whether MCP OAuth metadata/token/registration should be proxied through the
 * Dust MCP host. Enabled in development only; never active in production.
 * Toggle via `MCP_OAUTH_PROXY_ENABLED` in this file.
 */
export function shouldUseProxy(): boolean {
  return isDevelopment() && MCP_OAUTH_PROXY_ENABLED;
}

/**
 * AuthKit Connect domain for MCP OAuth (e.g. `your-env.authkit.app`).
 *
 * This is NOT the same as `WORKOS_ISSUER_URL` / `auth-api.dust.tt`, which is
 * Dust's WorkOS API hostname used for SDK calls and SSO session JWT issuer.
 * Connect OAuth metadata and JWKS live on the AuthKit domain — find it in the
 * WorkOS dashboard under Connect → Configuration.
 */
export function getWorkOSAuthKitDomain(): string {
  return normalizeOAuthUrl(config.getWorkOSAuthKitDomain().trim());
}

/** Canonical form for comparing OAuth resource/issuer URLs (RFC 8707). */
export function normalizeOAuthUrl(url: string): string {
  const withScheme =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;
  const parsed = new URL(withScheme);
  parsed.hash = "";
  parsed.search = "";
  const pathname = parsed.pathname.replace(/\/$/, "");
  return pathname ? `${parsed.origin}${pathname}` : parsed.origin;
}

export function getMcpResourceServerUrl(): string {
  // In dev, we do not have the magical ingress redirect so we need to use the API url.
  if (isDevelopment()) {
    return normalizeOAuthUrl(
      EnvironmentConfig.getEnvVariable("DUST_FRONT_API").trim() + "/mcp"
    );
  }
  return normalizeOAuthUrl(
    EnvironmentConfig.getEnvVariable("DUST_CLIENT_FACING_URL").trim() + "/mcp"
  );
}

/** MCP server URL safe to display in client UI (uses public API base URL). */
export function getMcpResourceServerUrlForClient(): string {
  return normalizeOAuthUrl(`${config.getApiBaseUrl().trim()}/mcp`);
}

/** MCP host origin for OAuth AS metadata discovery (proxied by front-api). */
export function getMcpAuthorizationServerUrl(): string {
  return normalizeOAuthUrl(new URL(getMcpResourceServerUrl()).origin);
}

export function getMcpAuthorizationServers(): string[] {
  return shouldUseProxy()
    ? [getMcpAuthorizationServerUrl()]
    : [getWorkOSAuthKitDomain()];
}

export function getWorkOSAuthKitOAuthTokenUrl(): string {
  return `${getWorkOSAuthKitDomain()}/oauth2/token`;
}

export function getWorkOSAuthKitOAuthRegistrationUrl(): string {
  return `${getWorkOSAuthKitDomain()}/oauth2/register`;
}

export function getMcpResourceMetadataUrl(resourceServerUrl: string): URL {
  const url = new URL(resourceServerUrl);
  return new URL(
    `/.well-known/oauth-protected-resource${url.pathname.replace(/\/$/, "")}`,
    url.origin
  );
}

export function getMcpProtectedResourcePath(resourceServerUrl: string): string {
  const pathname = new URL(resourceServerUrl).pathname.replace(/\/$/, "");
  return `/.well-known/oauth-protected-resource${pathname}`;
}
