import type { OAuthProvider } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";

export async function createConnectionAndGetRedirectURL(
  auth: Authenticator,
  provider: OAuthProvider
): Promise<string> {
  return "";
}
