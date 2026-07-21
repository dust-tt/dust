import type {
  LLMParameterOverwrites,
  LLMParameters,
} from "@app/lib/api/llm/types/options";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  GROK_4_5_MODEL_ID,
  GROK_4_MODEL_ID,
} from "@app/types/assistant/models/xai";

export const XAI_PROVIDER_ID = "xai";

export const XAI_WHITELISTED_MODEL_IDS = [
  GROK_4_5_MODEL_ID,
  GROK_4_MODEL_ID,
] as const;
export type XaiWhitelistedModelId = (typeof XAI_WHITELISTED_MODEL_IDS)[number];

export const XAI_MODEL_CONFIGS: Record<
  XaiWhitelistedModelId,
  {
    defaultReasoningEffort?: ReasoningEffort;
    overwrites: LLMParameterOverwrites;
  }
> = {
  [GROK_4_5_MODEL_ID]: {
    defaultReasoningEffort: "high",
    overwrites: {},
  },
  [GROK_4_MODEL_ID]: {
    overwrites: {},
  },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: XaiWhitelistedModelId;
  }
): LLMParameters & { modelId: XaiWhitelistedModelId } {
  const config = XAI_MODEL_CONFIGS[llmParameters.modelId];

  return {
    ...llmParameters,
    ...(llmParameters.reasoningEffort === undefined &&
    config.defaultReasoningEffort
      ? { reasoningEffort: config.defaultReasoningEffort }
      : {}),
    ...config.overwrites,
  };
}

export const isXaiWhitelistedModelId = (
  modelId: ModelIdType
): modelId is XaiWhitelistedModelId => {
  return (XAI_WHITELISTED_MODEL_IDS as readonly string[]).includes(modelId);
};
