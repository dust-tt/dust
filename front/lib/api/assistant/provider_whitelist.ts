import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";

// Canonical way to check if a provider is whitelisted.
// Handle the special case of the auto model.
export function isProviderWhitelisted(
  whitelistedProviders: Set<ModelProviderIdType>,
  providerId: ModelProviderIdType
): boolean {
  return providerId === AUTO_MODEL_ID || whitelistedProviders.has(providerId);
}
