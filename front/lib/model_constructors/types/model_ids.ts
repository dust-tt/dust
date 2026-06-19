export const GPT_5_5_MODEL_ID = "gpt-5.5" as const;
export const GPT_5_4_MODEL_ID = "gpt-5.4" as const;
export const GPT_5_4_MINI_MODEL_ID = "gpt-5.4-mini" as const;
export const GPT_5_4_NANO_MODEL_ID = "gpt-5.4-nano" as const;
export const GPT_5_2_MODEL_ID = "gpt-5.2" as const;
export const GPT_5_MODEL_ID = "gpt-5" as const;
export const GPT_5_1_MODEL_ID = "gpt-5.1" as const;
export const GPT_5_MINI_MODEL_ID = "gpt-5-mini" as const;
export const GPT_5_NANO_MODEL_ID = "gpt-5-nano" as const;

export const CLAUDE_SONNET_4_6_MODEL_ID = "claude-sonnet-4-6" as const;
export const CLAUDE_OPUS_4_8_MODEL_ID = "claude-opus-4-8" as const;
export const CLAUDE_HAIKU_4_5_MODEL_ID = "claude-haiku-4-5-20251001" as const;

export const GEMINI_3_1_PRO_MODEL_ID = "gemini-3.1-pro-preview" as const;
export const GEMINI_3_5_FLASH_MODEL_ID = "gemini-3.5-flash" as const;
export const GEMINI_3_1_FLASH_LITE_MODEL_ID = "gemini-3.1-flash-lite" as const;

export const MISTRAL_LARGE_MODEL_ID = "mistral-large-latest" as const;
export const MISTRAL_MEDIUM_3_5_MODEL_ID = "mistral-medium-3-5" as const;
export const MISTRAL_SMALL_MODEL_ID = "mistral-small-latest" as const;
export const MISTRAL_CODESTRAL_MODEL_ID = "codestral-latest" as const;

// Include a few examples for now
export const MODEL_IDS = [
  GPT_5_5_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GPT_5_4_MINI_MODEL_ID,
  GPT_5_4_NANO_MODEL_ID,
  GPT_5_2_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_1_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_HAIKU_4_5_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_5_FLASH_MODEL_ID,
  GEMINI_3_1_FLASH_LITE_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_3_5_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
  MISTRAL_CODESTRAL_MODEL_ID,
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export function isModelId(value: string): value is ModelId {
  return (MODEL_IDS as readonly string[]).includes(value);
}

export const ORDERED_LARGE_MODEL_IDS = [
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  GPT_5_5_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GPT_5_2_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_1_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
];
