import type { ModelIdType } from "@app/types";
import { GEMINI_2_5_PRO_MODEL_ID } from "@app/types";

export const GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS = [
  GEMINI_2_5_PRO_MODEL_ID,
] as const;

export type GoogleAIStudioWhitelistedModelId =
  (typeof GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS)[number];

export function isGoogleAIStudioWhitelistedModelId(
  modelId: ModelIdType
): modelId is GoogleAIStudioWhitelistedModelId {
  return new Set<string>(GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS).has(modelId);
}
