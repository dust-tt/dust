import type { LLMParameters } from "@app/lib/api/llm/types/options";
import { QWEN_3_5_MODEL_ID } from "@app/types/assistant/models/ollama";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { ChatRequest } from "ollama";

export const OLLAMA_PROVIDER_ID = "ollama";

export const OLLAMA_WHITELISTED_MODEL_IDS = [QWEN_3_5_MODEL_ID] as const;
export type OllamaWhitelistedModelId =
  (typeof OLLAMA_WHITELISTED_MODEL_IDS)[number];

export const OLLAMA_MODEL_CONFIGS: Record<
  OllamaWhitelistedModelId,
  {
    overwrites?: Omit<LLMParameters, "modelId">;
    thinkingConfig: Record<ReasoningEffort, ChatRequest["think"]>;
  }
> = {
  [QWEN_3_5_MODEL_ID]: {
    thinkingConfig: {
      none: false,
      light: true,
      medium: true,
      high: true,
    },
  },
};

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: OllamaWhitelistedModelId;
  }
): LLMParameters & { modelId: OllamaWhitelistedModelId } {
  return {
    ...llmParameters,
    ...OLLAMA_MODEL_CONFIGS[llmParameters.modelId].overwrites,
  };
}

export function isOllamaWhitelistedModelId(
  modelId: ModelIdType
): modelId is OllamaWhitelistedModelId {
  return (OLLAMA_WHITELISTED_MODEL_IDS as readonly string[]).includes(modelId);
}
