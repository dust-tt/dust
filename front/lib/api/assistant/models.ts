import { getWhitelistedProviders } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";

export function isProviderWhitelisted(
  auth: Authenticator,
  providerId: ModelProviderIdType
): boolean {
  const whitelistedProviders = getWhitelistedProviders(auth);
  return whitelistedProviders.has(providerId);
}
