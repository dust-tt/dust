import {
  AUTO_MODEL_ID,
  isModelStreamId,
} from "@app/types/assistant/models/auto";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";

// Canonical way to check if a provider is whitelisted.
// Handle the special case of the routing sentinels (auto, auto_quick, auto_deep),
// which route to a concrete (whitelisted) model at message-send time.
export function isProviderWhitelisted(
  whitelistedProviders: Set<ModelProviderIdType>,
  providerId: ModelProviderIdType
): boolean {
  return (
    providerId === AUTO_MODEL_ID ||
    isModelStreamId(providerId) ||
    whitelistedProviders.has(providerId)
  );
}
