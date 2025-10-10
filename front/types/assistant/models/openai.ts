/**
 * MODEL IDS
 */
import type { ModelConfigurationType } from "@app/types";

export const GPT_3_5_TURBO_MODEL_ID = "gpt-3.5-turbo" as const;
export const GPT_4_TURBO_MODEL_ID = "gpt-4-turbo" as const;
export const GPT_4O_MODEL_ID = "gpt-4o" as const;
export const GPT_4_1_MODEL_ID = "gpt-4.1-2025-04-14" as const;
export const GPT_4_1_MINI_MODEL_ID = "gpt-4.1-mini-2025-04-14" as const;
export const GPT_4O_20240806_MODEL_ID = "gpt-4o-2024-08-06" as const;
export const GPT_4O_MINI_MODEL_ID = "gpt-4o-mini" as const;
export const GPT_5_MODEL_ID = "gpt-5" as const;
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
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
  shortDescription: "OpenAI's most advanced model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 32_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
};
export const OPENAI_FORMATTING_META_PROMPT = `# Response Formats
SYSTEM STYLE: Rich Markdown by default
- Always respond using rich Markdown unless the user explicitly requests another format.
- You can use H1 titles (# Title) when appropriate.
- Organize content into sections with H2/H3 headings (##, ###). Favor paragraphs and subsections.
- Use bullet/numbered lists sparingly and never as the sole structure of the response.
- Include tables when they materially aid clarity; use code blocks for code, configs, or commands.
- If the user specifies a different format, follow the user’s instructions.
- When style directives conflict, prefer this Markdown style guide.
NEVER:
- Return a response that is just a list of bullet points.
- Omit headings in multi-paragraph answers.`;
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
export const GPT_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_MODEL_ID,
  displayName: "GPT 5",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 5 model (400k context).",
  shortDescription: "OpenAI's latest model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 128_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
};
export const GPT_5_MINI_NO_REASONING_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_MINI_MODEL_ID,
  displayName: "GPT-5 Mini",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's faster, and cost-efficient version of GPT-5 for well-defined tasks.",
  shortDescription: "OpenAI's latest mini model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 128_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
};
export const GPT_5_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_MINI_MODEL_ID,
  displayName: "GPT-5 Mini",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's faster, and cost-efficient version of GPT-5 for well-defined tasks.",
  shortDescription: "OpenAI's latest mini model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 128_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
};
export const GPT_5_NANO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_5_NANO_MODEL_ID,
  displayName: "GPT-5 Nano",
  contextSize: 400_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's fastest, and most cost-efficient version of GPT-5",
  shortDescription: "OpenAI's latest model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 128_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  featureFlag: "openai_o1_feature",
  customAssistantFeatureFlag: "openai_o1_custom_assistants_feature",
  supportsResponseFormat: false,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  customAssistantFeatureFlag: "openai_o1_custom_assistants_feature",
  supportsResponseFormat: false,
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
  minimumReasoningEffort: "medium",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
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
  minimumReasoningEffort: "medium",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
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
  minimumReasoningEffort: "medium",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
  formattingMetaPrompt: OPENAI_FORMATTING_META_PROMPT,
  toolUseMetaPrompt: OPENAI_TOOL_USE_META_PROMPT,
};
