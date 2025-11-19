import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import {
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
} from "@app/types";

const GOOGLE_AI_STUDIO_PROVIDER_ID = "google_ai_studio";
export const GOOGLE_AI_STUDIO_MODEL_FAMILIES = [
  "gemini-2",
  "gemini-3",
] as const;
export type GoogleAIStudioModelFamily =
  (typeof GOOGLE_AI_STUDIO_MODEL_FAMILIES)[number];

export const GOOGLE_AI_STUDIO_MODEL_FAMILY_CONFIGS = {
  "gemini-2": {
    modelIds: [
      GEMINI_2_5_FLASH_MODEL_ID,
      GEMINI_2_5_FLASH_LITE_MODEL_ID,
      GEMINI_2_5_PRO_MODEL_ID,
    ],
    overwrites: {},
  },
  "gemini-3": {
    modelIds: [GEMINI_3_PRO_MODEL_ID],
    overwrites: {
      // Not required but strongly recommended by Google for Gemini 3
      temperature: 1,
    },
  },
} as const satisfies Record<
  GoogleAIStudioModelFamily,
  {
    modelIds: ModelIdType[];
    overwrites: Partial<LLMParameters>;
  }
>;

export type GoogleAIStudioWhitelistedModelId = {
  [K in GoogleAIStudioModelFamily]: (typeof GOOGLE_AI_STUDIO_MODEL_FAMILY_CONFIGS)[K]["modelIds"][number];
}[GoogleAIStudioModelFamily];
export const GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS =
  flatMap<GoogleAIStudioWhitelistedModelId>(
    Object.values(GOOGLE_AI_STUDIO_MODEL_FAMILY_CONFIGS).map(
      (config) => config.modelIds
    )
  );

export function isGoogleAIStudioWhitelistedModelId(
  modelId: ModelIdType
): modelId is GoogleAIStudioWhitelistedModelId {
  return new Set<string>(GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS).has(modelId);
}

export function getGoogleAIStudioModelFamilyFromModelId(
  modelId: GoogleAIStudioWhitelistedModelId
): GoogleAIStudioModelFamily {
  const family = GOOGLE_AI_STUDIO_MODEL_FAMILIES.find((family) =>
    new Set(GOOGLE_AI_STUDIO_MODEL_FAMILY_CONFIGS[family].modelIds).has(modelId)
  );
  if (!family) {
    throw new Error(
      `Model ID ${modelId} does not belong to any Google model family`
    );
  }
  return family;
}

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: GoogleAIStudioWhitelistedModelId;
  }
): LLMParameters & { modelId: GoogleAIStudioWhitelistedModelId } & {
  clientId: typeof GOOGLE_AI_STUDIO_PROVIDER_ID;
} {
  const config = Object.values(GOOGLE_AI_STUDIO_MODEL_FAMILY_CONFIGS).find(
    (config) => new Set<string>(config.modelIds).has(llmParameters.modelId)
  );

  return {
    ...llmParameters,
    ...config?.overwrites,
    clientId: GOOGLE_AI_STUDIO_PROVIDER_ID,
  };
}
