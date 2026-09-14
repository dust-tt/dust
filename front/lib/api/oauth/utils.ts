import config from "@app/lib/api/config";
import type { OAuthConnectionType, OAuthProvider } from "@app/types/oauth/lib";
import { isDevelopment } from "@app/types/shared/env";
import type { ParsedUrlQuery } from "querystring";

export function finalizeUriForProvider({
  provider,
  connection,
}: {
  provider: OAuthProvider;
  connection: OAuthConnectionType | null;
}): string {
  if (isDevelopment()) {
    const devBaseUrl = config.getDevOAuthRedirectBaseUrl();
    if (devBaseUrl) {
      return devBaseUrl + `/oauth/${provider}/finalize`;
    }
  }

  // A connection knows the URI it was created with, nothing else is as true.
  // Finalized connections always have one, pendings have it since it is stored
  // at creation. The only flows that reach the fallback are popups in flight
  // across the cutover deploy, which fail once and heal on retry.
  if (connection?.redirect_uri) {
    return connection.redirect_uri;
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
