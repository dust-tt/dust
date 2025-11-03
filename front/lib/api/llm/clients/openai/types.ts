import assert from "assert";
import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";

export const OPENAI_MODEL_FAMILIES = [
  "o3",
  "non-reasoning",
  "reasoning",
] as const;
export type OpenAIModelFamily = (typeof OPENAI_MODEL_FAMILIES)[number];

export const OPENAI_MODEL_FAMILY_CONFIGS = {
  o3: {
    modelIds: [],
    overwrites: { temperature: 0 },
  },
  reasoning: {
    modelIds: [],
    overwrites: {},
  },
  "non-reasoning": {
    modelIds: [],
    overwrites: { reasoningEffort: undefined },
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

export function overwriteLLMParameters(
  llMParameters: LLMParameters & { modelId: OpenAIWhitelistedModelId }
): LLMParameters & { modelId: OpenAIWhitelistedModelId } {
  const config = Object.values(OPENAI_MODEL_FAMILY_CONFIGS).find((config) =>
    new Set<string>(config.modelIds).has(llMParameters.modelId)
  );
  assert(
    config,
    `No OpenAI model family config found for model ID ${llMParameters.modelId}`
  );

  return {
    ...llMParameters,
    ...config.overwrites,
  };
}
