export const GPT_5_6_SOL = "gpt-5.6-sol" as const;
export const GPT_5_6_TERRA = "gpt-5.6-terra" as const;
export const GPT_5_6_TERRA_LONG_CONTEXT = "gpt-5.6-terra-long-context" as const;
export const GPT_5_6_LUNA = "gpt-5.6-luna" as const;
export const GPT_5_5 = "gpt-5.5" as const;
export const GPT_5_4 = "gpt-5.4" as const;
export const GPT_5_4_MINI = "gpt-5.4-mini" as const;
export const GPT_5_4_NANO = "gpt-5.4-nano" as const;
export const GPT_5_2 = "gpt-5.2" as const;
export const GPT_5 = "gpt-5" as const;
export const GPT_5_1 = "gpt-5.1" as const;
export const GPT_5_MINI = "gpt-5-mini" as const;
export const GPT_5_NANO = "gpt-5-nano" as const;

export const CLAUDE_SONNET_4_6 = "claude-sonnet-4-6" as const;
export const CLAUDE_SONNET_5 = "claude-sonnet-5" as const;
export const CLAUDE_FABLE_5 = "claude-fable-5" as const;
export const CLAUDE_OPUS_4_6 = "claude-opus-4-6" as const;
export const CLAUDE_OPUS_4_7 = "claude-opus-4-7" as const;
export const CLAUDE_OPUS_4_8 = "claude-opus-4-8" as const;
export const CLAUDE_OPUS_5 = "claude-opus-5" as const;
export const CLAUDE_HAIKU_4_5 = "claude-haiku-4-5-20251001" as const;

export const GEMINI_3_1_PRO = "gemini-3.1-pro-preview" as const;
export const GEMINI_3_5_FLASH = "gemini-3.5-flash" as const;
export const GEMINI_3_6_FLASH = "gemini-3.6-flash" as const;
export const GEMINI_3_7_FLASH = "gemini-3.7-flash" as const;
export const GEMINI_3_8_FLASH = "gemini-3.8-flash" as const;
export const GEMINI_3_1_FLASH_LITE = "gemini-3.1-flash-lite" as const;
export const GEMINI_3_5_FLASH_LITE = "gemini-3.5-flash-lite" as const;

export const MISTRAL_LARGE = "mistral-large-latest" as const;
export const MISTRAL_MEDIUM_3_5 = "mistral-medium-3-5" as const;
export const MISTRAL_SMALL = "mistral-small-latest" as const;
export const MISTRAL_CODESTRAL = "codestral-latest" as const;

export const DEEPSEEK_V3P2 = "deepseek-v3p2" as const;
export const DEEPSEEK_V4_PRO = "deepseek-v4-pro" as const;
export const DEEPSEEK_V4_FLASH_0731 = "deepseek-v4-flash-0731" as const;
export const KIMI_K2_INSTRUCT = "kimi-k2-instruct-0905" as const;
export const KIMI_K2P5 = "kimi-k2p5" as const;
export const KIMI_K2P6 = "kimi-k2p6" as const;
export const KIMI_K3 = "kimi-k3" as const;
export const MINIMAX_M2P5 = "minimax-m2p5" as const;
export const GLM_5 = "glm-5" as const;
export const GLM_5P2 = "glm-5p2" as const;
export const GLM_5P3_FLASH = "glm-5p3-flash" as const;
export const INKLING = "inkling" as const;

export const GROK_4_5 = "grok-4.5" as const;
export const GROK_4_6 = "grok-4.6" as const;

// Dummy model used for local/dev testing (static replies, simulated credit
// consumption). Served by the in-process noop endpoint, not an external API.
export const NOOP_MODEL = "noop" as const;

// Include a few examples for now
export const MODELS = [
  GPT_5_6_SOL,
  GPT_5_6_TERRA,
  GPT_5_6_TERRA_LONG_CONTEXT,
  GPT_5_6_LUNA,
  GPT_5_5,
  GPT_5_4,
  GPT_5_4_MINI,
  GPT_5_4_NANO,
  GPT_5_2,
  GPT_5,
  GPT_5_1,
  GPT_5_MINI,
  GPT_5_NANO,
  CLAUDE_SONNET_4_6,
  CLAUDE_SONNET_5,
  CLAUDE_FABLE_5,
  CLAUDE_OPUS_4_6,
  CLAUDE_OPUS_4_7,
  CLAUDE_OPUS_4_8,
  CLAUDE_OPUS_5,
  CLAUDE_HAIKU_4_5,
  GEMINI_3_1_PRO,
  GEMINI_3_5_FLASH,
  GEMINI_3_6_FLASH,
  GEMINI_3_7_FLASH,
  GEMINI_3_8_FLASH,
  GEMINI_3_1_FLASH_LITE,
  GEMINI_3_5_FLASH_LITE,
  MISTRAL_LARGE,
  MISTRAL_MEDIUM_3_5,
  MISTRAL_SMALL,
  MISTRAL_CODESTRAL,
  DEEPSEEK_V3P2,
  DEEPSEEK_V4_PRO,
  DEEPSEEK_V4_FLASH_0731,
  KIMI_K2_INSTRUCT,
  KIMI_K2P5,
  KIMI_K2P6,
  KIMI_K3,
  MINIMAX_M2P5,
  GLM_5,
  GLM_5P2,
  GLM_5P3_FLASH,
  INKLING,
  GROK_4_5,
  GROK_4_6,
  NOOP_MODEL,
] as const;

export type Model = (typeof MODELS)[number];

export function isModel(value: string): value is Model {
  return (MODELS as readonly string[]).includes(value);
}

export const ORDERED_LARGE_MODELS = [
  CLAUDE_FABLE_5,
  CLAUDE_OPUS_5,
  CLAUDE_OPUS_4_8,
  CLAUDE_OPUS_4_7,
  CLAUDE_OPUS_4_6,
  CLAUDE_SONNET_5,
  CLAUDE_SONNET_4_6,
  GPT_5_6_SOL,
  GPT_5_5,
  GPT_5_4,
  GPT_5_2,
  GPT_5,
  GPT_5_1,
  GEMINI_3_1_PRO,
  GROK_4_6,
  GROK_4_5,
];
