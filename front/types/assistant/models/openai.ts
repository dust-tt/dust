/**
 * MODEL IDS
 */
import type { ModelConfigurationType } from "./types";

export const GPT_3_5_TURBO_MODEL_ID = "gpt-3.5-turbo" as const;
// Image generation model IDs (internal-only, not user-selectable)
export const GPT_IMAGE_1_5_MODEL_ID = "gpt-image-1.5" as const;
export const GPT_IMAGE_2_MODEL_ID = "gpt-image-2" as const;
export const GPT_4_TURBO_MODEL_ID = "gpt-4-turbo" as const;
export const GPT_4O_MODEL_ID = "gpt-4o" as const;
export const GPT_4_1_MODEL_ID = "gpt-4.1-2025-04-14" as const;
export const GPT_4_1_MINI_MODEL_ID = "gpt-4.1-mini-2025-04-14" as const;
export const GPT_4O_20240806_MODEL_ID = "gpt-4o-2024-08-06" as const;
export const GPT_4O_MINI_MODEL_ID = "gpt-4o-mini" as const;
export const GPT_5_MODEL_ID = "gpt-5" as const;
export const GPT_5_1_MODEL_ID = "gpt-5.1" as const;
export const GPT_5_2_MODEL_ID = "gpt-5.2" as const;
export const GPT_5_4_MODEL_ID = "gpt-5.4" as const;
export const GPT_5_5_MODEL_ID = "gpt-5.5" as const;
export const GPT_6_ASTRA_MODEL_ID = "gpt-6-astra" as const;
export const GPT_5_6_SOL_MODEL_ID = "gpt-5.6-sol" as const;
export const GPT_5_6_TERRA_MODEL_ID = "gpt-5.6-terra" as const;
export const GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID =
  "gpt-5.6-terra-long-context" as const;
export const GPT_5_6_LUNA_MODEL_ID = "gpt-5.6-luna" as const;
export const GPT_5_4_MINI_MODEL_ID = "gpt-5.4-mini" as const;
export const GPT_5_4_NANO_MODEL_ID = "gpt-5.4-nano" as const;
export const GPT_5_MINI_MODEL_ID = "gpt-5-mini" as const;
export const GPT_5_NANO_MODEL_ID = "gpt-5-nano" as const;
export const O1_MODEL_ID = "o1" as const;
export const O1_MINI_MODEL_ID = "o1-mini" as const;
export const O3_MINI_MODEL_ID = "o3-mini" as const;
export const O3_MODEL_ID = "o3" as const;
export const O4_MINI_MODEL_ID = "o4-mini" as const;
export const GPT_3_5_TURBO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_3_5_TURBO_MODEL_ID,
  displayName: "GPT 3.5 turbo",
  contextSize: 16_384,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 24, // 12_288
  largeModel: false,
  description:
    "OpenAI's GPT 3.5 Turbo model, cost-effective and high throughput (16k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_4_TURBO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_TURBO_MODEL_ID,
  displayName: "GPT 4 turbo",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4 Turbo model for complex tasks (128k context).",
  shortDescription: "OpenAI's second best model.",
  isLegacy: false,
  isLatest: false,

  generationTokensCount: 2048,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_4O_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's GPT4-o model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 16_384,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_4_1_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_1_MINI_MODEL_ID,
  displayName: "GPT 4.1 mini",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4.1 mini model (1M context).",
  shortDescription: "OpenAI's most advanced mini model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 32_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_4_1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_1_MODEL_ID,
  displayName: "GPT 4.1",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4.1 model (1M context).",
  shortDescription: "OpenAI's smartest non reasoning model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 32_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_4O_20240806_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_20240806_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's older most advanced model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 16_384,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_4O_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_MINI_MODEL_ID,
  displayName: "GPT 4o-mini",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4o mini model (128k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  isLatest: false,

  generationTokensCount: 16_384,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const OPENAI_FORMATTING_META_PROMPT = `
SYSTEM STYLE: Rich Markdown by default
- Always respond using rich Markdown unless the user explicitly requests another format.
- Default to clear narrative prose in connected, multi-sentence paragraphs when the answer is more than a couple of sentences.
- Use smooth transitions and coherent flow, similar to a well-structured explanation or report.
- Use Markdown headings (##, ###) to structure multi-paragraph answers into sections when helpful.
- H1 titles (# Title) are optional; only add a title when the user asks for a document-like answer (for example a report, plan, or spec) or explicitly requests a title.
- In short, conversational, or single-sentence answers (such as greetings or quick confirmations), do not use headings or titles; respond with plain text.
- Bullet or numbered lists are allowed only for brief, supporting enumerations; they must not be the primary structure of the response.
- Prefer paragraphs over lists for the main ideas of the answer.
- Include tables when they materially aid clarity; use code blocks for code, configs, or commands.
- If the user specifies a different format, follow the user’s instructions even if it conflicts with this style guide.
- When style directives conflict, prefer this Markdown style guide.
NEVER:
- Return a response that is just a list of bullet points.
- Add headings or titles for trivial, one-line answers.`;
export const OPENAI_TOOL_USE_META_PROMPT =
  `CRITICAL: When calling functions or tools, ` +
  `you MUST be extremely careful with accented characters. ` +
  `Always use the actual accented character in the JSON, ` +
  `never use Unicode escape sequences like \\u00XX.
CORRECT examples (what you SHOULD do):
- Use: {"query": "Žižek philosophy"}
- Use: {"query": "café français"}
- Use: {"query": "naïveté übermensch"}
- Use: {"query": "Søren Kierkegaard"}
INCORRECT examples (what you must NEVER do):
- Never: {"query": "\\u017di\\u017eek philosophy"}
- Never: {"query": "caf\\u00e9 fran\\u00e7ais"}
- Never: {"query": "na\\u00efvet\\u00e9"}
The tools expect properly formed JSON with actual UTF-8 characters, not escape sequences.`;
// Validated against OpenAI's input-token count API on 2026-08-13: for the incident payload,
// GPT-5.6 Sol reported 20,473 input tokens while o200k_base counted 20,467 content tokens.
// https://developers.openai.com/api/docs/guides/token-counting
export const GPT_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_MODEL_ID,
  displayName: "GPT 5",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 5 model (400k context).",
  shortDescription: "OpenAI's flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  // gpt-5 does not support "none" but "minimal"
  // so we set the minimum to "light" to avoid confusion
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_5_1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_1_MODEL_ID,
  displayName: "GPT 5.1",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 5.1 model (400k context).",
  shortDescription: "OpenAI's previous flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_5_2_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_2_MODEL_ID,
  displayName: "GPT 5.2",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "OpenAI's GPT 5.2 model for complex reasoning tasks (400k context).",
  shortDescription: "OpenAI's previous flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_5_4_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_4_MODEL_ID,
  displayName: "GPT 5.4",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "OpenAI's GPT 5.4 model for complex reasoning and agentic tasks (1M context).",
  shortDescription: "OpenAI's previous flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_5_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_5_MODEL_ID,
  displayName: "GPT 5.5",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "OpenAI's GPT 5.5 model for complex reasoning, coding, and agentic tasks (1M context).",
  shortDescription: "OpenAI's previous flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
// Verified 2026-09-05: https://developers.openai.com/api/docs/models/gpt-6-astra
// Dust caps the native 1,050,000-token context at GPT-5.6's 272,000 tokens.
export const GPT_6_ASTRA_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_6_ASTRA_MODEL_ID,
  displayName: "GPT 6 Astra",
  contextSize: 272_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "OpenAI's GPT 6 Astra model for complex reasoning, coding, and agentic tasks (272k context).",
  shortDescription: "OpenAI's latest flagship model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  availableIfOneOf: {
    creditPricedPlan: true,
    plansWithAdvancedModels: true,
    featureFlag: "claude_4_5_opus_feature",
  },
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
// https://openai.com/index/previewing-gpt-5-6-sol/
// gpt-5.6-sol adds xhigh/max reasoning levels upstream; we map onto the codebase's
// none/light/medium/high abstraction exactly like gpt-5.5.
export const GPT_5_6_SOL_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_6_SOL_MODEL_ID,
  displayName: "GPT 5.6 Sol",
  contextSize: 272_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "OpenAI's GPT 5.6 Sol model for complex reasoning, coding, and agentic tasks (272k context).",
  shortDescription: "OpenAI's GPT 5.6 flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  availableIfOneOf: {
    creditPricedPlan: true,
    plansWithAdvancedModels: true,
    featureFlag: "claude_4_5_opus_feature",
  },
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
// https://openai.com/index/previewing-gpt-5-6-sol/
// gpt-5.6-terra is the balanced, lower-cost sibling of gpt-5.6-sol; same
// reasoning abstraction mapping as gpt-5.6-sol.
export const GPT_5_6_TERRA_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_6_TERRA_MODEL_ID,
  displayName: "GPT 5.6 Terra",
  contextSize: 272_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "OpenAI's GPT 5.6 Terra model, a balanced option for everyday reasoning, coding, and agentic tasks (272k context).",
  shortDescription: "OpenAI's latest balanced model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
// Verified 2026-08-19: https://developers.openai.com/api/docs/models/gpt-5.6-terra
// OpenAI exposes a 1,050,000-token context window and 128,000 max output tokens.
export const GPT_5_6_TERRA_LONG_CONTEXT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  displayName: "GPT 5.6 Terra (long context)",
  contextSize: 1_050_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "OpenAI's GPT 5.6 Terra model with extended context window (up to 1M tokens).",
  shortDescription:
    "GPT 5.6 Terra with extended context window (up to 1M tokens).",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  availableIfOneOf: {
    featureFlag: "gpt_5_6_terra_long_context",
  },
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
// https://openai.com/index/previewing-gpt-5-6-sol/
// gpt-5.6-luna is the fastest, most cost-efficient member of the gpt-5.6
// family; same reasoning abstraction mapping as gpt-5.6-sol.
export const GPT_5_6_LUNA_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_6_LUNA_MODEL_ID,
  displayName: "GPT 5.6 Luna",
  contextSize: 272_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description:
    "OpenAI's GPT 5.6 Luna model, its fastest and most cost-efficient option for well-defined tasks (272k context).",
  shortDescription: "OpenAI's fastest, most cost-efficient model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
export const GPT_5_4_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_4_MINI_MODEL_ID,
  displayName: "GPT-5.4 Mini",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description:
    "OpenAI's faster, cost-efficient version of GPT-5.4 for well-defined tasks (400k context).",
  shortDescription: "OpenAI's mini model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  supportsToolSearch: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
// https://developers.openai.com/api/docs/models/gpt-5.4-nano
export const GPT_5_4_NANO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_4_NANO_MODEL_ID,
  displayName: "GPT-5.4 Nano",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description:
    "OpenAI's fastest, most cost-efficient version of GPT-5.4 (400k context).",
  shortDescription: "OpenAI's fastest model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_5_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_MINI_MODEL_ID,
  displayName: "GPT-5 Mini",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: false,
  description:
    "OpenAI's faster, and cost-efficient version of GPT-5 for well-defined tasks.",
  shortDescription: "OpenAI's latest mini model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const GPT_5_NANO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_NANO_MODEL_ID,
  displayName: "GPT-5 Nano",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: false,
  description: "OpenAI's fastest, and most cost-efficient version of GPT-5",
  shortDescription: "OpenAI's fastest model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const O1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O1_MODEL_ID,
  displayName: "o1",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's reasoning model designed to solve hard problems across domains (Limited preview access).",
  shortDescription: "OpenAI's reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  availableIfOneOf: {
    featureFlag: "openai_o1_feature",
  },
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const O1_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O1_MINI_MODEL_ID,
  displayName: "o1-mini",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's fast reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const O3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O3_MODEL_ID,
  displayName: "o3",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's most advanced reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's best reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: false,
    light: false,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const O3_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O3_MINI_MODEL_ID,
  displayName: "o3-mini",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's fast reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: false,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
export const O4_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O4_MINI_MODEL_ID,
  displayName: "o4-mini",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "OpenAI's o4 mini model (200k context).",
  shortDescription: "OpenAI's fast o4 model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: false,
    light: false,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
