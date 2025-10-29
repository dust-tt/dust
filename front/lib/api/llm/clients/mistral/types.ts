import type { ModelIdType } from "@app/types";
import { MISTRAL_LARGE_MODEL_ID, MISTRAL_SMALL_MODEL_ID } from "@app/types";

export const MISTRAL_WHITELISTED_MODEL_IDS = [
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
] as const;

export type MistralWhitelistedModelId =
  (typeof MISTRAL_WHITELISTED_MODEL_IDS)[number];

export function isMistralWhitelistedModelId(
  modelId: ModelIdType
): modelId is MistralWhitelistedModelId {
  return new Set<string>(MISTRAL_WHITELISTED_MODEL_IDS).has(modelId);
}
