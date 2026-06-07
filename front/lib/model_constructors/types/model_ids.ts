export const GPT_5_4_MODEL_ID = "gpt-5.4" as const;
export const GPT_5_2_MODEL_ID = "gpt-5.2" as const;

export const CLAUDE_SONNET_4_6_MODEL_ID = "claude-sonnet-4-6" as const;

export const GEMINI_3_1_PRO_MODEL_ID = "gemini-3.1-pro-preview" as const;

export const MODEL_IDS = [
  GPT_5_4_MODEL_ID,
  GPT_5_2_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export function isModelId(value: string): value is ModelId {
  return (MODEL_IDS as readonly string[]).includes(value);
}

export const ORDERED_LARGE_MODEL_IDS = [
  CLAUDE_SONNET_4_6_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
];
