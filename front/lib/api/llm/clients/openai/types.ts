import flatMap from "lodash/flatMap";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import { O3_MODEL_ID } from "@app/types";

export const OPENAI_MODEL_FAMILIES = [
  "o3",
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
  reasoning: {
    modelIds: [],
    overwrites: { temperature: null },
  },
  "non-reasoning": {
    modelIds: [],
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
  for (const family of OPENAI_MODEL_FAMILIES) {
    const config = OPENAI_MODEL_FAMILY_CONFIGS[family];
    if (config.modelIds.includes(modelId)) {
      return family;
    }
  }
  throw new Error(
    `Model ID ${modelId} does not belong to any OpenAI model family`
  );
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
