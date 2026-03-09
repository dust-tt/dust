import type { ModelConfigurationType } from "./types";

export const QWEN_3_5_MODEL_ID = "qwen3.5:9b" as const;

export const QWEN_3_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "ollama",
  modelId: QWEN_3_5_MODEL_ID,
  displayName: "Qwen 3.5",
  contextSize: 262_144,
  recommendedTopK: 20,
  recommendedExhaustiveTopK: 20,
  largeModel: false,
  description:
    "Alibaba's latest multimodal local model with vision support and hybrid architecture, supporting 201 languages.",
  shortDescription: "Alibaba's latest local model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: false, // response format not compatible with tool use
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
