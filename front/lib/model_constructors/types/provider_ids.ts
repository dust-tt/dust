import type { ModelProviderIdType } from "@app/types/assistant/models/types";

export const OPENAI_LAB = "openai" as const;
export const ANTHROPIC_PROVIDER_LAB = "anthropic" as const;
export const GOOGLE_LAB = "google_ai_studio" as const;
export const MISTRAL_LAB = "mistral" as const;
export const FIREWORKS_LAB = "fireworks" as const;
export const NOOP_LAB = "noop" as const;

// `satisfies readonly ModelProviderIdType[]` guarantees every new-system
// provider id is also a legacy `ModelProviderIdType`. This keeps `ProviderId`
// a true subset, so narrowing helpers like `isProviderId` filter the legacy
// union without silently dropping ids on a naming drift (e.g. the previous
// "google-ai-studio" vs "google_ai_studio" mismatch).
const LABS = [
  OPENAI_LAB,
  ANTHROPIC_PROVIDER_LAB,
  GOOGLE_LAB,
  MISTRAL_LAB,
  FIREWORKS_LAB,
  NOOP_LAB,
] as const satisfies readonly ModelProviderIdType[];
export type Lab = (typeof LABS)[number];

export function isLab(value: string): value is Lab {
  return (LABS as readonly string[]).includes(value);
}
