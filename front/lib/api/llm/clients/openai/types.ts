import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import {
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_5_1_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types";

export const OPENAI_MODEL_FAMILIES = [
  "o3",
  "o3-no-vision",
  "no-vision",
  "non-reasoning",
  "reasoning",
] as const;
export type OpenAIModelFamily = (typeof OPENAI_MODEL_FAMILIES)[number];

export const OPENAI_MODEL_FAMILY_CONFIGS: Record<
  OpenAIModelFamily,
  {
    modelIds: ModelIdType[];
    overwrites: Partial<LLMParameters>;
  }
> = {
  o3: {
    modelIds: [O3_MODEL_ID],
    overwrites: { temperature: null },
  },
  "o3-no-vision": {
    modelIds: [O3_MINI_MODEL_ID],
    overwrites: { temperature: null },
  },
  reasoning: {
    modelIds: [
      O1_MODEL_ID,
      O4_MINI_MODEL_ID,
      GPT_5_1_MODEL_ID,
      GPT_5_MODEL_ID,
      GPT_5_MINI_MODEL_ID,
      GPT_5_NANO_MODEL_ID,
    ],
    overwrites: { temperature: null },
  },
  "non-reasoning": {
    modelIds: [
      GPT_4_TURBO_MODEL_ID,
      GPT_4O_MODEL_ID,
      GPT_4O_MINI_MODEL_ID,
      GPT_4_1_MODEL_ID,
      GPT_4_1_MINI_MODEL_ID,
      GPT_4O_20240806_MODEL_ID,
    ],
    overwrites: { reasoningEffort: null },
  },
  "no-vision": {
    modelIds: [GPT_3_5_TURBO_MODEL_ID],
    overwrites: { reasoningEffort: null },
  },
} as const;

export type OpenAIWhitelistedModelId = {
  [K in OpenAIModelFamily]: (typeof OPENAI_MODEL_FAMILY_CONFIGS)[K]["modelIds"][number];
}[OpenAIModelFamily];
export const OPENAI_WHITELISTED_MODEL_IDS = flatMap<OpenAIWhitelistedModelId>(
  Object.values(OPENAI_MODEL_FAMILY_CONFIGS).map((config) => config.modelIds)
);

export function isOpenAIResponsesWhitelistedModelId(
  modelId: ModelIdType
): modelId is OpenAIWhitelistedModelId {
  return new Set<string>(OPENAI_WHITELISTED_MODEL_IDS).has(modelId);
}

export function getOpenAIModelFamilyFromModelId(
  modelId: OpenAIWhitelistedModelId
): OpenAIModelFamily {
  const family = OPENAI_MODEL_FAMILIES.find((family) =>
    OPENAI_MODEL_FAMILY_CONFIGS[family].modelIds.includes(modelId)
  );
  if (!family) {
    throw new Error(
      `Model ID ${modelId} does not belong to any OpenAI model family`
    );
  }
  return family;
}

export function overwriteLLMParameters(
  llMParameters: LLMParameters & {
    modelId: OpenAIWhitelistedModelId;
  }
): LLMParameters & { modelId: OpenAIWhitelistedModelId } & {
  clientId: "openai";
} {
  const config = Object.values(OPENAI_MODEL_FAMILY_CONFIGS).find((config) =>
    new Set<string>(config.modelIds).has(llMParameters.modelId)
  );

  return {
    ...llMParameters,
    ...config?.overwrites,
    clientId: "openai" as const,
  };
}
