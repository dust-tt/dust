import config from "@app/lib/api/config";
import type {
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { isDevelopment } from "@app/types/shared/env";
import type { ParsedUrlQuery } from "querystring";

/**
 * @cc [owner:flvndvd,label:security] provider-callback-default
 * Outside the development override, a stored redirect_uri MUST take precedence.
 * Without one, the connection use case, mcp, and mcp_static MUST use
 * DUST_OAUTH_REDIRECT_BASE_URL when set, otherwise the app URL. The use case
 * comes from the explicit argument, falling back to connection metadata.
 * All other provider/use-case combinations MUST default to the app URL.
 */
export function finalizeUriForProvider({
  provider,
  connection,
  useCase,
}: {
  provider: OAuthProvider;
  connection: OAuthConnectionType | null;
  useCase?: OAuthUseCase;
}): string {
  if (isDevelopment()) {
    const devBaseUrl = config.getDevOAuthRedirectBaseUrl();
    if (devBaseUrl) {
      return devBaseUrl + `/oauth/${provider}/finalize`;
    }
  }

  // Keep the callback paired with the client's registration across URL changes.
  if (connection?.redirect_uri) {
    return connection.redirect_uri;
  }

  // Connector and remote MCP apps may only allow the legacy cell callback.
  if (
    (useCase ?? connection?.metadata.use_case) === "connection" ||
    provider === "mcp" ||
    provider === "mcp_static"
  ) {
    return (
      config.getLegacyOAuthRedirectBaseUrl() + `/oauth/${provider}/finalize`
    );
  }

  return config.getAppUrl() + `/oauth/${provider}/finalize`;
}

export function getStringFromQuery(
  query: ParsedUrlQuery,
  key: string
): string | null {
  const value = query[key];
  if (typeof value != "string") {
    return null;
  }
  return value;
}
