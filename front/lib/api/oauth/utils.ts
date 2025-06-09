import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { OAuthProvider } from "@app/types";

export function finalizeUriForProvider(provider: OAuthProvider): string {
  return config.getClientFacingUrl() + `/oauth/${provider}/finalize`;
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
