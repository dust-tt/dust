import type { ModelProviderIdType } from "@app/types/assistant/models/types";

export const OPENAI_PROVIDER_ID = "openai" as const;
export const ANTHROPIC_PROVIDER_ID = "anthropic" as const;
export const GOOGLE_AI_STUDIO_PROVIDER_ID = "google_ai_studio" as const;
export const MISTRAL_PROVIDER_ID = "mistral" as const;
export const FIREWORKS_PROVIDER_ID = "fireworks" as const;

// `satisfies readonly ModelProviderIdType[]` guarantees every new-system
// provider id is also a legacy `ModelProviderIdType`. This keeps `ProviderId`
// a true subset, so narrowing helpers like `isProviderId` filter the legacy
// union without silently dropping ids on a naming drift (e.g. the previous
// "google-ai-studio" vs "google_ai_studio" mismatch).
const PROVIDER_IDS = [
  OPENAI_PROVIDER_ID,
  ANTHROPIC_PROVIDER_ID,
  GOOGLE_AI_STUDIO_PROVIDER_ID,
  MISTRAL_PROVIDER_ID,
  FIREWORKS_PROVIDER_ID,
] as const satisfies readonly ModelProviderIdType[];
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
