import type { ModelConfigurationType } from "@app/types";

export const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID =
  "meta-llama/Llama-3.3-70B-Instruct-Turbo" as const;
export const TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID =
  "Qwen/QwQ-32B-Preview" as const;
export const TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID =
  "Qwen/Qwen2-72B-Instruct" as const;
export const TOGETHERAI_DEEPSEEK_V3_MODEL_ID =
  "deepseek-ai/DeepSeek-V3" as const;
export const TOGETHERAI_DEEPSEEK_R1_MODEL_ID =
  "deepseek-ai/DeepSeek-R1" as const;
export const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
    displayName: "Llama 3.3 70B Instruct Turbo",
    contextSize: 128_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64, // 32_768
    largeModel: true,
    description: "Meta's fast, powerful and open source model (128k context).",
    shortDescription: "Meta's open source model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };
export const TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID =
  "Qwen/Qwen2.5-Coder-32B-Instruct" as const;
export const TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID,
    displayName: "Qwen 2.5 Coder 32B Instruct",
    contextSize: 32_000,
    recommendedTopK: 16,
    recommendedExhaustiveTopK: 56, // 28_672
    largeModel: false,
    description: "Alibaba's fast model for coding (32k context).",
    shortDescription: "Alibaba's fast coding model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };
export const TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID,
    displayName: "Qwen QwQ 32B Preview",
    contextSize: 32_000,
    recommendedTopK: 16,
    recommendedExhaustiveTopK: 56, // 28_672
    largeModel: false,
    description: "Alibaba's fast reasoning model (32k context).",
    shortDescription: "Alibaba's fast reasoning model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };
export const TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID,
    displayName: "Qwen 72B Instruct",
    contextSize: 32_000,
    recommendedTopK: 16,
    recommendedExhaustiveTopK: 56, // 28_672
    largeModel: false,
    description: "Alibaba's powerful model (32k context).",
    shortDescription: "Alibaba's powerful model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };
export const TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "togetherai",
  modelId: TOGETHERAI_DEEPSEEK_V3_MODEL_ID,
  displayName: "DeepSeek V3 (TogetherAI)",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's best model (v3, 64k context).",
  shortDescription: "DeepSeek's best model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
export const TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "togetherai",
  modelId: TOGETHERAI_DEEPSEEK_R1_MODEL_ID,
  displayName: "DeepSeek R1 (TogetherAI)",
  contextSize: 163_840,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek R1 (reasoning, 163k context, served via TogetherAI).",
  shortDescription: "DeepSeek R1 (reasoning model).",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
