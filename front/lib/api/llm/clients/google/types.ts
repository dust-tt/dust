import type { ModelIdType, ReasoningEffort } from "@app/types";
import {
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
} from "@app/types";

export const GOOGLE_AI_STUDIO_WHITELISTED_NON_REASONING_MODEL_IDS: ModelIdType[] =
  [];

export const GOOGLE_AI_STUDIO_WHITELISTED_REASONING_MODEL_IDS: ModelIdType[] = [
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
];

export const GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS: ModelIdType[] = [
  ...GOOGLE_AI_STUDIO_WHITELISTED_NON_REASONING_MODEL_IDS,
  ...GOOGLE_AI_STUDIO_WHITELISTED_REASONING_MODEL_IDS,
];

export type GoogleAIStudioWhitelistedModelId =
  (typeof GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS)[number];

export function isGoogleAIStudioWhitelistedModelId(
  modelId: ModelIdType
): modelId is GoogleAIStudioWhitelistedModelId {
  return new Set<string>(GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS).has(modelId);
}

export type GoogleModelFamily = "reasoning" | "non-reasoning";

export function getGoogleModelFamilyFromModelId(
  modelId: ModelIdType
): GoogleModelFamily {
  if (
    new Set<string>(GOOGLE_AI_STUDIO_WHITELISTED_REASONING_MODEL_IDS).has(
      modelId
    )
  ) {
    return "reasoning";
  }
  if (
    new Set<string>(GOOGLE_AI_STUDIO_WHITELISTED_NON_REASONING_MODEL_IDS).has(
      modelId
    )
  ) {
    return "non-reasoning";
  }

  throw new Error(`Unknown Google model ID: ${modelId}`);
}

export const GOOGLE_REASONING_EFFORT_TO_THINKING_BUDGET: {
  [key in ReasoningEffort]: number;
} = {
  none: 0,
  light: 0,
  medium: 1024,
  high: 4096,
}; // inspired by Claude 4 thinking budget tokens
