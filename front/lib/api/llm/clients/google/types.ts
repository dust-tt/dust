import type { ModelIdType } from "@app/types";
import {
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
} from "@app/types";

export const GOOGLE_AI_STUDIO_WHITELISTED_NON_REASONING_MODEL_IDS = [] as const;

export const GOOGLE_AI_STUDIO_WHITELISTED_REASONING_MODEL_IDS = [
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
] as const;

export const GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS = [
  ...GOOGLE_AI_STUDIO_WHITELISTED_NON_REASONING_MODEL_IDS,
  ...GOOGLE_AI_STUDIO_WHITELISTED_REASONING_MODEL_IDS,
] as const;

export type GoogleAIStudioWhitelistedModelId =
  (typeof GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS)[number];

export function isGoogleAIStudioWhitelistedModelId(
  modelId: ModelIdType
): modelId is GoogleAIStudioWhitelistedModelId {
  return new Set<string>(GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS).has(modelId);
}
