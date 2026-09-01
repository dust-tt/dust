import type { ModelConfigurationType } from "./types";

export const FIREWORKS_DEEPSEEK_V3P2_MODEL_ID =
  "accounts/fireworks/models/deepseek-v3p2" as const;
export const FIREWORKS_DEEPSEEK_V4_FLASH_0731_MODEL_ID =
  "accounts/fireworks/models/deepseek-v4-flash-0731" as const;
export const FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID =
  "accounts/fireworks/models/deepseek-v4-pro" as const;
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID =
  "accounts/fireworks/models/kimi-k2-instruct-0905" as const;
export const FIREWORKS_KIMI_K2P5_MODEL_ID =
  "accounts/fireworks/models/kimi-k2p5" as const;
export const FIREWORKS_KIMI_K2P6_MODEL_ID =
  "accounts/fireworks/models/kimi-k2p6" as const;
export const FIREWORKS_KIMI_K3_MODEL_ID =
  "accounts/fireworks/models/kimi-k3" as const;
export const FIREWORKS_MINIMAX_M2P5_MODEL_ID =
  "accounts/fireworks/models/minimax-m2p5" as const;
export const FIREWORKS_GLM_5_MODEL_ID =
  "accounts/fireworks/models/glm-5" as const;
export const FIREWORKS_GLM_5P2_MODEL_ID =
  "accounts/fireworks/models/glm-5p2" as const;
export const FIREWORKS_GLM_5P3_FLASH_MODEL_ID =
  "accounts/fireworks/models/glm-5p3-flash" as const;
export const FIREWORKS_INKLING_MODEL_ID =
  "accounts/fireworks/models/inkling" as const;
export const FIREWORKS_DEEPSEEK_V3P2_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "deepseek",
  modelId: FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  displayName: "DeepSeek V3.2",
  contextSize: 163_800,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "DeepSeek's V3.2 model with high computational efficiency and superior reasoning (163.8k context, served via Fireworks).",
  shortDescription: "DeepSeek's V3.2 model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  // TODO(2025-12-03 pierre) Deepseek V3.2 reasoning support requires a bit more work
  // https://api-docs.deepseek.com/guides/thinking_mode
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// Verified 2026-08-01: https://fireworks.ai/models/deepseek-ai/deepseek-v4-flash-0731
// Native 1040k/384k, capped to 256k/64k here (see Kimi K3).
export const FIREWORKS_DEEPSEEK_V4_FLASH_0731_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "fireworks",
    modelMaker: "deepseek",
    modelId: FIREWORKS_DEEPSEEK_V4_FLASH_0731_MODEL_ID,
    displayName: "DeepSeek V4 Flash",
    contextSize: 256_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description:
      "DeepSeek's V4 Flash Mixture-of-Experts model (284B total / 13B active) tuned for fast, cost-efficient reasoning, coding and agentic work, with 256k context (served via Fireworks).",
    shortDescription: "DeepSeek's V4 Flash model.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 64_000,
    supportsVision: false,
    // No native `medium`; `mapReasoningEffortToLowHighMax` folds our ladder on.
    supportedReasoningEfforts: {
      none: true,
      light: true,
      medium: true,
      high: true,
    },
    defaultReasoningEffort: "light",
    // Native thinking at `light`, so no chain-of-thought meta prompt.
    useNativeLightReasoning: true,
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
    regionalAvailability: {
      "us-central1": true,
      "europe-west1": false,
    },
  };
export const FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "deepseek",
  modelId: FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID,
  displayName: "DeepSeek V4 Pro",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "DeepSeek's V4 Pro Mixture-of-Experts model with frontier reasoning, advanced coding, and 1M context (served via Fireworks).",
  shortDescription: "DeepSeek's V4 Pro model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
  displayName: "Kimi K2 Instruct",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Kimi's K2 Instruct model (131k context, served via Fireworks).",
  shortDescription: "Kimi's K2 Instruct model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const FIREWORKS_KIMI_K2P5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K2P5_MODEL_ID,
  displayName: "Kimi K2.5",
  contextSize: 262_100,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Moonshot AI's agentic model with 262k context and vision support (served via Fireworks).",
  shortDescription: "Kimi K2.5 with vision support.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// https://fireworks.ai/models/fireworks/kimi-k2p6
export const FIREWORKS_KIMI_K2P6_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K2P6_MODEL_ID,
  displayName: "Kimi K2.6",
  contextSize: 262_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Moonshot AI's K2.6 agentic model with 262k context and vision support (served via Fireworks).",
  shortDescription: "Kimi K2.6 with vision support.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// Specs and pricing verified 2026-07-27 against
// https://fireworks.ai/models/fireworks/kimi-k3 (1040k context, function
// calling, image input) and https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
// (JSON-schema structured output, thinking always enabled).
// US-only, like every other Fireworks-served model.
// Dust caps usable context at 256k of the model's 1040k, leaving a 192k prompt
// budget once the 64k generation reserve is taken out.
export const FIREWORKS_KIMI_K3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K3_MODEL_ID,
  displayName: "Kimi K3",
  contextSize: 256_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Moonshot AI's flagship 2.8T Mixture-of-Experts model for complex coding and long-horizon agentic work, with 256k context and vision support (served via Fireworks).",
  shortDescription: "Kimi K3 with 256k context and vision support.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  // K3 thinks on every request, so there is no `none` tier: `light` reaches
  // Fireworks as `low`, then `medium`/`high` straight through.
  supportedReasoningEfforts: {
    none: false,
    light: true,
    // K3 has no native `medium`; the `mapReasoningEffortToLowHighMax` config
    // parser folds it onto `high`.
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  // Native thinking at `light`, so no chain-of-thought meta prompt.
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const FIREWORKS_MINIMAX_M2P5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "minimax",
  modelId: FIREWORKS_MINIMAX_M2P5_MODEL_ID,
  displayName: "MiniMax M2.5",
  contextSize: 196_608,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "MiniMax's MoE model optimized for coding and agentic tool use (196k context, served via Fireworks).",
  shortDescription: "MiniMax M2.5 for coding and agentic tasks.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// https://fireworks.ai/models/fireworks/glm-5p2
export const FIREWORKS_GLM_5P2_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "zai",
  modelId: FIREWORKS_GLM_5P2_MODEL_ID,
  displayName: "GLM-5.2",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Z.ai's GLM-5.2 Mixture-of-Experts model with advanced coding and long-horizon agentic capabilities (1M context, served via Fireworks).",
  shortDescription: "GLM-5.2 for coding and agentic tasks.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: false,
    medium: false,
    high: true,
  },
  defaultReasoningEffort: "high",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// Specs, pricing, and availability verified 2026-08-31 against
// https://docs.z.ai/guides/vlm/glm-5.3-flash and
// https://fireworks.ai/models/fireworks/glm-5p3-flash. The provider supports
// 1,048,576 context / 131,072 output; Dust caps those to 256k / 64k, matching
// the standard-context GPT and Claude models.
export const FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "zai",
  modelId: FIREWORKS_GLM_5P3_FLASH_MODEL_ID,
  displayName: "GLM-5.3 Flash",
  contextSize: 256_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Z.ai's efficient native multimodal model for coding, long-horizon agentic work, and visual understanding (256k context, served via Fireworks).",
  shortDescription: "GLM-5.3 Flash for multimodal coding and agentic tasks.",
  isLegacy: false,
  // Flash is the latest efficiency model; GLM-5.2 remains the latest full-size
  // model rather than being demoted by this separate subfamily.
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  // GLM-5.3 Flash documents low/high/max. Dust maps light/medium/high onto
  // those native efforts in the llms layer; thinking cannot be disabled.
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const FIREWORKS_GLM_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "zai",
  modelId: FIREWORKS_GLM_5_MODEL_ID,
  displayName: "GLM-5",
  contextSize: 202_752,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Zhipu AI's MoE model for complex systems engineering and long-horizon agentic tasks (202k context, served via Fireworks).",
  shortDescription: "GLM-5 for systems engineering and agentic tasks.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};

// Specs, availability, and pricing verified 2026-08-14 against
// https://fireworks.ai/models/fireworks/inkling (serverless, 1040k context,
// function calling, image input, $1/$0.17/$4.05 per 1M tokens) and
// https://huggingface.co/thinkingmachines/Inkling (text/image/audio input,
// text output, controllable thinking). The native endpoint limits are kept in
// model_constructors; Dust caps generation at 64k tokens.
export const FIREWORKS_INKLING_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "thinking_machines",
  modelId: FIREWORKS_INKLING_MODEL_ID,
  displayName: "Inkling",
  // Fireworks metadata reports 1,048,576 tokens, while the live inference API
  // enforces a 1,000,000-token prompt-plus-completion budget.
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Thinking Machines Lab's open-weights multimodal Mixture-of-Experts model with controllable reasoning and 1M context (served via Fireworks).",
  shortDescription:
    "Inkling with controllable reasoning, vision, and 1M context.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    // Fireworks accepts `none` as the lowest effort, but Inkling still emits a
    // reasoning trace at that level, so Dust does not present it as disabled.
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "high",
  useNativeLightReasoning: true,
  // Fireworks documents JSON-schema response formats, confirmed live for
  // Inkling on 2026-08-14:
  // https://docs.fireworks.ai/structured-responses/structured-response-formatting
  supportsResponseFormat: true,
  // Inkling's official renderer uses an o200k-base tokenizer:
  // https://tinker-docs.thinkingmachines.ai/cookbook/inkling/tml-renderers/
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
