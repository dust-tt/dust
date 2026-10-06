import config from "@app/lib/api/config";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import { isDevelopment } from "@app/types/shared/env";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

/** Flip to disable OAuth proxying in dev (e.g. native MCP clients → AuthKit direct). */
const MCP_OAUTH_PROXY_ENABLED = true;

/**
 * @cc [owner:tdraier,label:security;mcp] cimd-client-id-matches-document
 * The CIMD `client_id` is the document URL on the region's legacy OAuth redirect
 * host, and the document served there must carry that exact `client_id`, a
 * `client_uri` on the same origin and that region's MCP finalize callback.
 * Authorization servers reject a document whose `client_id` differs from its URL,
 * and some (e.g. Pendo) reject a `redirect_uri` whose origin matches neither
 * `client_id` nor `client_uri`.
 *
 * `front/public/.well-known/oauth-client.json` (served on app.dust.tt) is the
 * identity of connections created before this split: their stored `client_id`
 * points at it, so it must stay reachable and unchanged.
 */
export function getMcpClientIdMetadataDocumentUrl(): string {
  return `${config.getLegacyOAuthRedirectBaseUrl()}/.well-known/oauth-client.json`;
}

export function getMcpClientIdMetadataDocument() {
  return {
    client_id: getMcpClientIdMetadataDocumentUrl(),
    client_name: "Dust",
    client_uri: config.getLegacyOAuthRedirectBaseUrl(),
    logo_uri: "https://dust.tt/static/AppIcon.png",
    tos_uri: "https://dust.tt/terms",
    policy_uri: "https://dust.tt/privacy",
    contacts: ["support@dust.com"],
    software_id: "dust",
    redirect_uris: [
      finalizeUriForProvider({ provider: "mcp", connection: null }),
    ],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  } as const;
}

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
