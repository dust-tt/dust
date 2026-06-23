export const OPENAI_RESPONSES_API = "openai-responses" as const;
export const ANTHROPIC_API = "anthropic" as const;
export const GOOGLE_AI_STUDIO_API = "google-ai-studio" as const;
export const AGENT_PLATFORM_API = "agent-platform" as const;
export const MISTRAL_API = "mistral" as const;
export const FIREWORKS_API = "fireworks" as const;
export const TOGETHERAI_API = "togetherai" as const;

const PROVIDER_APIS = [
  OPENAI_RESPONSES_API,
  ANTHROPIC_API,
  GOOGLE_AI_STUDIO_API,
  AGENT_PLATFORM_API,
  MISTRAL_API,
  FIREWORKS_API,
  TOGETHERAI_API,
] as const;
export type ProviderApi = (typeof PROVIDER_APIS)[number];
