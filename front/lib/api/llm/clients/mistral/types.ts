import type { ModelIdType } from "@app/types";
import {
  MISTRAL_CODESTRAL_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
} from "@app/types";

export const MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT = [
  MISTRAL_CODESTRAL_MODEL_ID,
] as const;

export const MISTRAL_GENERIC_WHITELISTED_MODEL_IDS = [
  MISTRAL_SMALL_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
] as const;

export const MISTRAL_WHITELISTED_MODEL_IDS = [
  ...MISTRAL_GENERIC_WHITELISTED_MODEL_IDS,
  ...MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT,
] as const;

export type MistralWhitelistedModelId =
  (typeof MISTRAL_WHITELISTED_MODEL_IDS)[number];

export function isMistralWhitelistedModelId(
  modelId: ModelIdType
): modelId is MistralWhitelistedModelId {
  return new Set<string>(MISTRAL_WHITELISTED_MODEL_IDS).has(modelId);
}
