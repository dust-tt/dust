import type { ReasoningEffort as OpenAIReasoningEffort } from "openai/resources/shared";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType, ReasoningEffort } from "@app/types";
import {
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_5_1_MODEL_ID,
  GPT_5_2_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types";

export const OPENAI_PROVIDER_ID = "openai";

export const OPENAI_WHITELISTED_MODEL_IDS = [
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_1_MODEL_ID,
  GPT_5_2_MODEL_ID,
] as const;
export type OpenAIWhitelistedModelId =
  (typeof OPENAI_WHITELISTED_MODEL_IDS)[number];

const NON_THINKING_OVERWRITES: Partial<LLMParameters> = {
  reasoningEffort: null,
};
const THINKING_OVERWRITES: Partial<LLMParameters> = {
  temperature: null,
};

export const OPENAI_MODEL_CONFIGS: Record<
  OpenAIWhitelistedModelId,
  {
    overwrites: Omit<LLMParameters, "modelId">;
    reasoningConfigMapping?: Partial<
      Record<ReasoningEffort, OpenAIReasoningEffort>
    >;
  }
> = {
  [O1_MODEL_ID]: { overwrites: THINKING_OVERWRITES },
  [O3_MINI_MODEL_ID]: { overwrites: THINKING_OVERWRITES },
  [O3_MODEL_ID]: { overwrites: THINKING_OVERWRITES },
  [O4_MINI_MODEL_ID]: { overwrites: THINKING_OVERWRITES },
  [GPT_3_5_TURBO_MODEL_ID]: { overwrites: NON_THINKING_OVERWRITES },
  [GPT_4_TURBO_MODEL_ID]: { overwrites: NON_THINKING_OVERWRITES },
  [GPT_4O_MINI_MODEL_ID]: { overwrites: NON_THINKING_OVERWRITES },
  [GPT_4O_MODEL_ID]: { overwrites: NON_THINKING_OVERWRITES },
  [GPT_4O_20240806_MODEL_ID]: { overwrites: NON_THINKING_OVERWRITES },
  [GPT_4_1_MINI_MODEL_ID]: { overwrites: NON_THINKING_OVERWRITES },
  [GPT_4_1_MODEL_ID]: { overwrites: NON_THINKING_OVERWRITES },
  [GPT_5_NANO_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
    reasoningConfigMapping: { none: "minimal" },
  },
  [GPT_5_MINI_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
    reasoningConfigMapping: { none: "minimal" },
  },
  [GPT_5_MODEL_ID]: {
    overwrites: THINKING_OVERWRITES,
    reasoningConfigMapping: { none: "minimal" },
  },
  [GPT_5_1_MODEL_ID]: { overwrites: THINKING_OVERWRITES },
  [GPT_5_2_MODEL_ID]: { overwrites: THINKING_OVERWRITES },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: OpenAIWhitelistedModelId;
  }
): LLMParameters & { modelId: OpenAIWhitelistedModelId } & {
  clientId: typeof OPENAI_PROVIDER_ID;
} {
  return {
    ...llmParameters,
    ...OPENAI_MODEL_CONFIGS[llmParameters.modelId].overwrites,
    clientId: OPENAI_PROVIDER_ID,
  };
}

export const isOpenAIResponsesWhitelistedModelId = (
  modelId: ModelIdType
): modelId is OpenAIWhitelistedModelId => {
  return (OPENAI_WHITELISTED_MODEL_IDS as readonly string[]).includes(modelId);
};
