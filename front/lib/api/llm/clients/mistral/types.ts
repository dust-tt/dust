import type {
  LLMParameterOverwrites,
  LLMParameters,
} from "@app/lib/api/llm/types/options";
import {
  MISTRAL_CODESTRAL_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_3_5_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
} from "@app/types/assistant/models/mistral";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const MISTRAL_PROVIDER_ID = "mistral";

export const MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT = [
  MISTRAL_CODESTRAL_MODEL_ID,
];

export const MISTRAL_GENERIC_WHITELISTED_MODEL_IDS = [
  MISTRAL_SMALL_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_MEDIUM_3_5_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
];

export const MISTRAL_WHITELISTED_MODEL_IDS = [
  ...MISTRAL_GENERIC_WHITELISTED_MODEL_IDS,
  ...MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT,
] as const;

export type MistralWhitelistedModelId =
  (typeof MISTRAL_WHITELISTED_MODEL_IDS)[number];

const NON_REASONING_OVERWRITES: LLMParameterOverwrites = {
  reasoningEffort: null,
};
const REASONING_OVERWRITES: LLMParameterOverwrites = {
  temperature: null,
};

const MISTRAL_MODEL_CONFIGS: Record<
  MistralWhitelistedModelId,
  { overwrites: LLMParameterOverwrites }
> = {
  [MISTRAL_SMALL_MODEL_ID]: { overwrites: NON_REASONING_OVERWRITES },
  [MISTRAL_MEDIUM_MODEL_ID]: { overwrites: NON_REASONING_OVERWRITES },
  [MISTRAL_MEDIUM_3_5_MODEL_ID]: { overwrites: REASONING_OVERWRITES },
  [MISTRAL_LARGE_MODEL_ID]: { overwrites: NON_REASONING_OVERWRITES },
  [MISTRAL_CODESTRAL_MODEL_ID]: { overwrites: NON_REASONING_OVERWRITES },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & { modelId: MistralWhitelistedModelId }
): LLMParameters & { modelId: MistralWhitelistedModelId } {
  return {
    ...llmParameters,
    ...MISTRAL_MODEL_CONFIGS[llmParameters.modelId].overwrites,
  };
}

export function isMistralWhitelistedModelId(
  modelId: ModelIdType
): modelId is MistralWhitelistedModelId {
  return new Set<string>(MISTRAL_WHITELISTED_MODEL_IDS).has(modelId);
}
