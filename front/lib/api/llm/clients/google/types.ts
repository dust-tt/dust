import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType, ReasoningEffort } from "@app/types";
import {
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
} from "@app/types";

export const GOOGLE_AI_STUDIO_PROVIDER_ID = "google_ai_studio";

const GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS = [
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
] as const;
export type GoogleAIStudioWhitelistedModelId =
  (typeof GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS)[number];

export const GOOGLE_AI_STUDIO_MODEL_CONFIGS: Record<
  GoogleAIStudioWhitelistedModelId,
  {
    overwrites?: Omit<LLMParameters, "modelId">;
    thinkingBudgetConfigMapping?: Partial<Record<ReasoningEffort, number>>;
  }
> = {
  [GEMINI_2_5_FLASH_MODEL_ID]: { thinkingBudgetConfigMapping: { none: 0 } },
  [GEMINI_2_5_FLASH_LITE_MODEL_ID]: {
    thinkingBudgetConfigMapping: { none: 0 },
  },
  [GEMINI_2_5_PRO_MODEL_ID]: { thinkingBudgetConfigMapping: { none: 128 } },
  [GEMINI_3_PRO_MODEL_ID]: {
    overwrites: {
      // Not required but strongly recommended by Google for Gemini 3
      temperature: 1,
    },
    thinkingBudgetConfigMapping: { none: 128 },
  },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: GoogleAIStudioWhitelistedModelId;
  }
): LLMParameters & { modelId: GoogleAIStudioWhitelistedModelId } & {
  clientId: typeof GOOGLE_AI_STUDIO_PROVIDER_ID;
} {
  return {
    ...llmParameters,
    ...GOOGLE_AI_STUDIO_MODEL_CONFIGS[llmParameters.modelId].overwrites,
    clientId: GOOGLE_AI_STUDIO_PROVIDER_ID,
  };
}

export function isGoogleAIStudioWhitelistedModelId(
  modelId: ModelIdType
): modelId is GoogleAIStudioWhitelistedModelId {
  return (GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
}
