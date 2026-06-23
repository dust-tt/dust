import type {
  LLMParameterOverwrites,
  LLMParameters,
} from "@app/lib/api/llm/types/options";
import { TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID } from "@app/types/assistant/models/togetherai";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const TOGETHERAI_PROVIDER_ID = "togetherai";

export const TOGETHERAI_WHITELISTED_MODEL_IDS = [
  TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
] as const;
export type TogetheraiWhitelistedModelId =
  (typeof TOGETHERAI_WHITELISTED_MODEL_IDS)[number];

export const TOGETHERAI_MODEL_CONFIGS: Record<
  TogetheraiWhitelistedModelId,
  {
    overwrites: LLMParameterOverwrites;
  }
> = {
  // Non-reasoning model: never send a reasoning effort.
  [TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID]: {
    overwrites: { reasoningEffort: "none" },
  },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: TogetheraiWhitelistedModelId;
  }
): LLMParameters & { modelId: TogetheraiWhitelistedModelId } {
  return {
    ...llmParameters,
    ...TOGETHERAI_MODEL_CONFIGS[llmParameters.modelId].overwrites,
  };
}

export const isTogetheraiWhitelistedModelId = (
  modelId: ModelIdType
): modelId is TogetheraiWhitelistedModelId => {
  return (TOGETHERAI_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
};
