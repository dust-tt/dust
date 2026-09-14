import config from "@app/lib/api/config";
import type { OAuthConnectionType, OAuthProvider } from "@app/types/oauth/lib";
import { isDevelopment } from "@app/types/shared/env";
import type { ParsedUrlQuery } from "querystring";

// Connections created after this date use the app URL as their redirect base,
// one finalize URI per provider for every region and cell. Must match the day
// the cutover front build ships.
const CUTOFF_DATE_FOR_OAUTH_REDIRECT_BASE_URL = new Date("2026-09-16T00:00:00Z");

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
  if (connection?.redirect_uri) {
    return connection.redirect_uri;
  }

  // Pre-cutover connections without a stored URI (the column is written since
  // the cutover) keep the base that was in effect when they were created, the
  // region override on legacy, the app URL elsewhere.
  if (
    connection &&
    connection.created < CUTOFF_DATE_FOR_OAUTH_REDIRECT_BASE_URL.getTime()
  ) {
    return config.getOAuthRedirectBaseUrl() + `/oauth/${provider}/finalize`;
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
