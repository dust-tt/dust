import type {
  ModelConfig,
  OpenAIWhitelistedModelId,
} from "@app/lib/api/llm/clients/openai/types";
import {
  OPENAI_MODEL_FAMILY_CONFIGS,
  OPENAI_WHITELISTED_MODEL_IDS,
} from "@app/lib/api/llm/clients/openai/types";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";

export function isOpenAIResponsesWhitelistedModelId(
  modelId: ModelIdType
): modelId is OpenAIWhitelistedModelId {
  return new Set<string>(OPENAI_WHITELISTED_MODEL_IDS).has(modelId);
}

export function overwriteLLMParameters(
  llMParameters: LLMParameters & {
    modelId: OpenAIWhitelistedModelId;
  }
): LLMParameters & { modelId: OpenAIWhitelistedModelId } & {
  clientId: "openai";
} {
  const { defaults = {}, overwrites = {} } = getModelConfig(
    llMParameters.modelId
  );

  return {
    ...defaults,
    ...llMParameters,
    ...overwrites,
    clientId: "openai" as const,
  };
}

export function getModelConfig(modelId: ModelIdType): ModelConfig {
  if (!isOpenAIResponsesWhitelistedModelId(modelId)) {
    throw new Error(
      `Model ID ${modelId} is not a whitelisted OpenAI Responses model ID`
    );
  }

  const config = Object.values(OPENAI_MODEL_FAMILY_CONFIGS).find((config) =>
    new Set<string>(config.modelIds).has(modelId)
  );

  if (!config) {
    throw new Error(`Model ID ${modelId} is not a whitelisted OpenAI model ID`);
  }

  return config;
}
