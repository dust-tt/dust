import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import {
  FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
} from "@app/types";

export const FIREWORKS_PROVIDER_ID = "fireworks";

const FIREWORKS_WHITELISTED_MODEL_IDS = [
  FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
] as const;
export type FireworksWhitelistedModelId =
  (typeof FIREWORKS_WHITELISTED_MODEL_IDS)[number];

const FIREWORKS_MODEL_CONFIGS: Record<
  FireworksWhitelistedModelId,
  { overwrites: Omit<LLMParameters, "modelId"> }
> = {
  [FIREWORKS_DEEPSEEK_V3P2_MODEL_ID]: {
    overwrites: {},
  },
  [FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID]: {
    overwrites: { reasoningEffort: "none" },
  },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: FireworksWhitelistedModelId;
  }
): LLMParameters & { modelId: FireworksWhitelistedModelId } & {
  clientId: typeof FIREWORKS_PROVIDER_ID;
} {
  return {
    ...llmParameters,
    ...FIREWORKS_MODEL_CONFIGS[llmParameters.modelId].overwrites,
    clientId: FIREWORKS_PROVIDER_ID,
  };
}

export const isFireworksWhitelistedModelId = (
  modelId: ModelIdType
): modelId is FireworksWhitelistedModelId => {
  return (FIREWORKS_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
};
