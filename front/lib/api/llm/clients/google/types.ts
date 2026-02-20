import type { LLMParameters } from "@app/lib/api/llm/types/options";
import {
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_FLASH_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
} from "@app/types/assistant/models/google_ai_studio";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { type ThinkingConfig, ThinkingLevel } from "@google/genai";

export const GOOGLE_AI_STUDIO_PROVIDER_ID = "google_ai_studio";

export const GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS = [
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_FLASH_MODEL_ID,
] as const;
export type GoogleAIStudioWhitelistedModelId =
  (typeof GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS)[number];

const PRE_GEMINI_3_THINKING_CONFIG_MAPPING: Record<
  ReasoningEffort,
  ThinkingConfig
> = {
  // Budget of 0 would throw for some thinking models,
  // so we default to the minimum supported by all models.
  none: {
    thinkingBudget: 512,
    includeThoughts: false,
  },
  light: {
    thinkingBudget: 1024,
    includeThoughts: true,
  },
  medium: {
    thinkingBudget: 2048,
    includeThoughts: true,
  },
  high: {
    thinkingBudget: 4096,
    includeThoughts: true,
  },
};
const POST_GEMINI_3_THINKING_CONFIG_MAPPING: Record<
  Exclude<ReasoningEffort, "medium">,
  ThinkingConfig
> = {
  // None thinking level not supported by Gemini 3 models
  none: {
    thinkingBudget: 128,
    includeThoughts: false,
  },
  light: {
    thinkingLevel: ThinkingLevel.LOW,
    includeThoughts: true,
  },
  high: {
    thinkingLevel: ThinkingLevel.HIGH,
    includeThoughts: true,
  },
};

export const GOOGLE_AI_STUDIO_MODEL_CONFIGS: Record<
  GoogleAIStudioWhitelistedModelId,
  {
    overwrites?: Omit<LLMParameters, "modelId">;
    thinkingConfig: Record<ReasoningEffort, ThinkingConfig>;
  }
> = {
  [GEMINI_2_5_FLASH_MODEL_ID]: {
    thinkingConfig: {
      ...PRE_GEMINI_3_THINKING_CONFIG_MAPPING,
      none: { thinkingBudget: 0, includeThoughts: true },
    },
  },
  [GEMINI_2_5_FLASH_LITE_MODEL_ID]: {
    thinkingConfig: {
      ...PRE_GEMINI_3_THINKING_CONFIG_MAPPING,
      none: { thinkingBudget: 0, includeThoughts: true },
    },
  },
  [GEMINI_2_5_PRO_MODEL_ID]: {
    thinkingConfig: {
      ...PRE_GEMINI_3_THINKING_CONFIG_MAPPING,
      none: { thinkingBudget: 128, includeThoughts: true },
    },
  },
  // Keeping previous config for gemmini 3 to stay consistent with existing
  [GEMINI_3_FLASH_MODEL_ID]: {
    overwrites: {
      // Not required but strongly recommended by Google for Gemini 3
      temperature: 1,
    },
    thinkingConfig: {
      ...PRE_GEMINI_3_THINKING_CONFIG_MAPPING,
      none: {
        includeThoughts: false,
        thinkingBudget: 128,
      },
    },
  },
  [GEMINI_3_PRO_MODEL_ID]: {
    overwrites: {
      // Not required but strongly recommended by Google for Gemini 3
      temperature: 1,
    },
    thinkingConfig: {
      ...PRE_GEMINI_3_THINKING_CONFIG_MAPPING,
      none: {
        includeThoughts: false,
        thinkingBudget: 128,
      },
    },
  },
  [GEMINI_3_1_PRO_MODEL_ID]: {
    overwrites: {
      // Not required but strongly recommended by Google for Gemini 3
      temperature: 1,
    },
    thinkingConfig: {
      ...POST_GEMINI_3_THINKING_CONFIG_MAPPING,
      // ThinkingLevel.MEDIUM doesn't exist, fall back to LOW
      medium: {
        thinkingLevel: ThinkingLevel.LOW,
        includeThoughts: true,
      },
    },
  },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: GoogleAIStudioWhitelistedModelId;
  }
): LLMParameters & { modelId: GoogleAIStudioWhitelistedModelId } {
  return {
    ...llmParameters,
    ...GOOGLE_AI_STUDIO_MODEL_CONFIGS[llmParameters.modelId].overwrites,
  };
}

export function isGoogleAIStudioWhitelistedModelId(
  modelId: ModelIdType
): modelId is GoogleAIStudioWhitelistedModelId {
  return (GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
}
