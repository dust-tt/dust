import config from "@app/lib/api/config";
import type { OAuthConnectionType, OAuthProvider } from "@app/types/oauth/lib";
import { isDevelopment } from "@app/types/shared/env";
import type { ParsedUrlQuery } from "querystring";

// This is the cutoff date for the OAuth redirect base URL.
// Before this date, we use the api URL.
// After this date, we use the app URL.
const CUTOFF_DATE_FOR_OAUTH_REDIRECT_BASE_URL = new Date("2030-01-01");

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

  if (
    connection &&
    connection.created < CUTOFF_DATE_FOR_OAUTH_REDIRECT_BASE_URL.getTime()
  ) {
    // TODO(single-tenant): we need to use the api URL here.
    return config.getOAuthRedirectBaseUrl() + `/oauth/${provider}/finalize`;
  } else {
    return config.getOAuthRedirectBaseUrl() + `/oauth/${provider}/finalize`;
  }
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
