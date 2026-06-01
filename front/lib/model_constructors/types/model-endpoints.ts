import { GLOBAL, type Region } from "@app/lib/model_constructors/types/regions";

export const OPENAI_PROVIDER_ID = "openai" as const;
export const ANTHROPIC_PROVIDER_ID = "anthropic" as const;
export const GOOGLE_AI_STUDIO_PROVIDER_ID = "google-ai-studio" as const;

const PROVIDER_IDS = [
  OPENAI_PROVIDER_ID,
  ANTHROPIC_PROVIDER_ID,
  GOOGLE_AI_STUDIO_PROVIDER_ID,
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const OPENAI_API = "openai" as const;
export const ANTHROPIC_API = "anthropic" as const;
export const GOOGLE_AI_STUDIO_API = "google-ai-studio" as const;
export const AGENT_PLATFORM_API = "agent-platform" as const;

const PROVIDER_APIS = [
  OPENAI_API,
  ANTHROPIC_API,
  GOOGLE_AI_STUDIO_API,
  AGENT_PLATFORM_API,
] as const;
export type ProviderApi = (typeof PROVIDER_APIS)[number];

export const GPT_5_4_MODEL_ID = "gpt-5.4" as const;
export const GPT_5_2_MODEL_ID = "gpt-5.2" as const;

export const CLAUDE_SONNET_4_6_MODEL_ID = "claude-sonnet-4-6" as const;

export const GEMINI_3_1_PRO_MODEL_ID = "gemini-3.1-pro-preview" as const;

export const MODEL_ENDPOINTS = [
  {
    providerId: ANTHROPIC_PROVIDER_ID,
    api: ANTHROPIC_API,
    region: GLOBAL,
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
  },
  {
    providerId: OPENAI_PROVIDER_ID,
    api: OPENAI_API,
    region: GLOBAL,
    modelId: GPT_5_2_MODEL_ID,
  },
  {
    providerId: OPENAI_PROVIDER_ID,
    api: OPENAI_API,
    region: GLOBAL,
    modelId: GPT_5_4_MODEL_ID,
  },
  {
    providerId: GOOGLE_AI_STUDIO_PROVIDER_ID,
    api: GOOGLE_AI_STUDIO_API,
    region: GLOBAL,
    modelId: GEMINI_3_1_PRO_MODEL_ID,
  },
] as const;

export type ModelEndpoint = (typeof MODEL_ENDPOINTS)[number];

export type PairModelEndpointId<M> = M extends {
  providerId: infer P extends string;
  modelId: infer I extends string;
  region: infer R extends Region;
  api: infer A extends ProviderApi;
}
  ? `${P}/${A}/${R}/${I}`
  : never;

export type ModelEndpointId = PairModelEndpointId<ModelEndpoint>;
