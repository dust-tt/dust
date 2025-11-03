import assert from "assert";
import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import { GPT_4_1_MODEL_ID } from "@app/types";

const OPENAI_MODEL_FAMILIES = [
  "o3",
  "non-reasoning",
  "reasoning",
  "permissive",
] as const;
export type OpenAIModelFamily = (typeof OPENAI_MODEL_FAMILIES)[number];

const OPENAI_MODEL_FAMILY_CONFIGS = {
  o3: {
    modelIds: [],
    overwrites: { temperature: 0 },
  },
  reasoning: {
    modelIds: [],
    overwrites: {},
  },
  "non-reasoning": {
    modelIds: [GPT_4_1_MODEL_ID],
    overwrites: { reasoningEffort: "none" },
  },
  // TODO(LLM-Router 2025-11-03): remove this family when we have support for all models
  // Should not have any modelIds
  // This family is meant to test models before adding support
  permissive: {
    modelIds: [],
    overwrites: {},
  },
} as const;

type OpenAIWhitelistedModelId = {
  [K in OpenAIModelFamily]: (typeof OPENAI_MODEL_FAMILY_CONFIGS)[K]["modelIds"][number];
}[OpenAIModelFamily];
const OPENAI_WHITELISTED_MODEL_IDS = flatMap<OpenAIWhitelistedModelId>(
  Object.values(OPENAI_MODEL_FAMILY_CONFIGS).map((config) => config.modelIds)
);

export function isWhitelistedOpenAIModelId(
  modelId: string
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
