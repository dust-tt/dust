import config from "@app/lib/api/config";

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
  return normalizeOAuthUrl(config.getDustAPIConfig().url.trim() + "/mcp");
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
