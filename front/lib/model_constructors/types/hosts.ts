export const OPENAI_RESPONSES_HOST = "openai-responses" as const;
export const ANTHROPIC_HOST = "anthropic" as const;
export const GOOGLE_AI_STUDIO_HOST = "google-ai-studio" as const;
export const AGENT_PLATFORM_HOST = "agent-platform" as const;
export const MISTRAL_HOST = "mistral" as const;
export const FIREWORKS_HOST = "fireworks" as const;
export const NOOP_HOST = "noop" as const;

const HOSTS = [
  OPENAI_RESPONSES_HOST,
  ANTHROPIC_HOST,
  GOOGLE_AI_STUDIO_HOST,
  AGENT_PLATFORM_HOST,
  MISTRAL_HOST,
  FIREWORKS_HOST,
  NOOP_HOST,
] as const;
export type Host = (typeof HOSTS)[number];
