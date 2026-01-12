import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { OAuthProvider } from "@app/types";
import { isDevelopment } from "@app/types";

export function finalizeUriForProvider(provider: OAuthProvider): string {
  // Fathom does not accept http nor localhost in the redirect URL, even in dev.
  // Currently relying on an ngrok.
  if (isDevelopment() && provider === "fathom") {
    return config.getDevOAuthFathomRedirectBaseUrl() + "/oauth/fathom/finalize";
  }
  // Use auth redirect base URL for OAuth callbacks
  return config.getAuthRedirectBaseUrl() + `/oauth/${provider}/finalize`;
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
