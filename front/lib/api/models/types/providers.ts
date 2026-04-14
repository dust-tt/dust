export const OPENAI_PROVIDER_ID = "openai" as const;
export const ANTHROPIC_PROVIDER_ID = "anthropic" as const;

const PROVIDER_IDS = [OPENAI_PROVIDER_ID, ANTHROPIC_PROVIDER_ID] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const GPT_5_4_MODEL_ID = "gpt-5.4" as const;
export const GPT_5_2_MODEL_ID = "gpt-5.2" as const;

export const CLAUDE_SONNET_4_6_MODEL_ID = "claude-sonnet-4-6" as const;

export const MODELS = [
  { modelId: GPT_5_4_MODEL_ID, providerId: OPENAI_PROVIDER_ID },
  { modelId: GPT_5_2_MODEL_ID, providerId: OPENAI_PROVIDER_ID },
  { modelId: CLAUDE_SONNET_4_6_MODEL_ID, providerId: ANTHROPIC_PROVIDER_ID },
] as const;

export type Model = (typeof MODELS)[number];

type PairModelId<M> = M extends {
  providerId: infer P extends string;
  modelId: infer I extends string;
}
  ? `${P}/${I}`
  : never;
export type LargeLanguageModelId = PairModelId<Model>;
