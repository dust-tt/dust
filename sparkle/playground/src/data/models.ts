import { AnthropicLogo, MistralLogo, OpenaiLogo } from "@dust-tt/sparkle";
import type { ComponentType, SVGProps } from "react";

export type ModelProviderId = "anthropic" | "openai" | "mistral";

// Capability tier used to gate access per user profile.
export type ModelTier = "low" | "medium" | "high";

export interface ModelProvider {
  id: ModelProviderId;
  name: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface Model {
  id: string;
  name: string;
  description: string;
  provider: ModelProviderId;
  tier: ModelTier;
  legacy?: boolean;
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  { id: "anthropic", name: "Anthropic", icon: AnthropicLogo },
  { id: "openai", name: "OpenAI", icon: OpenaiLogo },
  { id: "mistral", name: "Mistral", icon: MistralLogo },
];

// ── Effort ──────────────────────────────────────────────────────────────────

export type Effort = "light" | "medium" | "high";

export interface EffortOption {
  value: Effort;
  label: string;
  description: string;
  color: string;
}

// Ordered from lowest to highest, used to compare effort against a cap.
export const EFFORT_ORDER: Effort[] = ["light", "medium", "high"];

export const EFFORTS: EffortOption[] = [
  {
    value: "light",
    label: "Quick",
    description: "Simple tasks",
    color: "#7AC0F0",
  },
  {
    value: "medium",
    label: "Standard",
    description: "Everyday tasks",
    color: "#C6E36B",
  },
  {
    value: "high",
    label: "Deep",
    description: "Heavy tasks",
    color: "#F5A9C8",
  },
];

export function getEffortOption(effort: Effort): EffortOption {
  return EFFORTS.find((e) => e.value === effort) ?? EFFORTS[1];
}

function effortRank(effort: Effort): number {
  return EFFORT_ORDER.indexOf(effort);
}

// ── Profiles ────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  description: string;
  // Max effort allowed per tier. A missing tier means no access to it.
  access: Partial<Record<ModelTier, Effort>>;
}

export const PROFILES: Profile[] = [
  {
    id: "free",
    name: "Cheap",
    description: "Haiku up to Deep, Sonnet up to Standard. No Opus.",
    access: {
      low: "high",
      medium: "medium",
    },
  },
  {
    id: "pro",
    name: "Normal",
    description: "Haiku and Sonnet up to Deep. No Opus.",
    access: {
      low: "high",
      medium: "high",
    },
  },
  {
    id: "max",
    name: "High cost",
    description: "All models, all efforts including Opus.",
    access: {
      low: "high",
      medium: "high",
      high: "high",
    },
  },
];

// Curated list, latest / most important first, excluding pre-Claude 4 and
// pre-GPT 5 models. Sourced from front/types/assistant/models/*.
export const MODELS: Model[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    description: "Anthropic's most capable model.",
    provider: "anthropic",
    tier: "high",
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    description: "Latest balanced Claude for everyday work.",
    provider: "anthropic",
    tier: "medium",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude 4.5 Haiku",
    description: "Fast and lightweight Claude.",
    provider: "anthropic",
    tier: "low",
  },
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    description: "Previous flagship Opus generation.",
    provider: "anthropic",
    tier: "high",
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    description: "High-capability Opus model.",
    provider: "anthropic",
    tier: "high",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "Balanced Sonnet model.",
    provider: "anthropic",
    tier: "medium",
  },
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude 4.5 Opus",
    description: "Powerful reasoning Opus model.",
    provider: "anthropic",
    tier: "high",
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude 4.5 Sonnet",
    description: "Reliable general-purpose Sonnet.",
    provider: "anthropic",
    tier: "medium",
  },
  {
    id: "claude-4-opus-20250514",
    name: "Claude 4 Opus",
    description: "First-generation Claude 4 Opus.",
    provider: "anthropic",
    tier: "high",
    legacy: true,
  },
  {
    id: "claude-4-sonnet-20250514",
    name: "Claude 4 Sonnet",
    description: "First-generation Claude 4 Sonnet.",
    provider: "anthropic",
    tier: "medium",
    legacy: true,
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    id: "gpt-5.6-sol",
    name: "GPT 5.6 Sol",
    description: "OpenAI's most advanced model.",
    provider: "openai",
    tier: "high",
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT 5.6 Terra",
    description: "High-capability GPT 5.6 variant.",
    provider: "openai",
    tier: "medium",
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT 5.6 Luna",
    description: "Efficient GPT 5.6 variant.",
    provider: "openai",
    tier: "low",
  },
  {
    id: "gpt-5.5",
    name: "GPT 5.5",
    description: "Previous flagship GPT generation.",
    provider: "openai",
    tier: "high",
  },
  {
    id: "gpt-5.4",
    name: "GPT 5.4",
    description: "Capable GPT 5 model.",
    provider: "openai",
    tier: "high",
  },
  {
    id: "gpt-5.2",
    name: "GPT 5.2",
    description: "General-purpose GPT 5 model.",
    provider: "openai",
    tier: "high",
    legacy: true,
  },
  {
    id: "gpt-5.1",
    name: "GPT 5.1",
    description: "General-purpose GPT 5 model.",
    provider: "openai",
    tier: "high",
    legacy: true,
  },
  {
    id: "gpt-5",
    name: "GPT 5",
    description: "First-generation GPT 5.",
    provider: "openai",
    tier: "high",
    legacy: true,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Fast and affordable GPT 5.",
    provider: "openai",
    tier: "low",
    legacy: true,
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    description: "Smallest and fastest GPT 5.",
    provider: "openai",
    tier: "low",
    legacy: true,
  },

  // ── Mistral ────────────────────────────────────────────────────────────
  {
    id: "mistral-large-latest",
    name: "Mistral Large",
    description: "Mistral's flagship model.",
    provider: "mistral",
    tier: "high",
  },
  {
    id: "mistral-medium-3-5",
    name: "Mistral Medium 3.5",
    description: "Balanced Mistral model with reasoning.",
    provider: "mistral",
    tier: "medium",
  },
  {
    id: "mistral-small-latest",
    name: "Mistral Small",
    description: "Lightweight and fast Mistral model.",
    provider: "mistral",
    tier: "low",
    legacy: true,
  },
  {
    id: "codestral-latest",
    name: "Mistral Codestral",
    description: "Mistral's code-specialized model.",
    provider: "mistral",
    tier: "low",
    legacy: true,
  },
];

export function getModelsByProvider(provider: ModelProviderId): Model[] {
  return MODELS.filter((m) => m.provider === provider);
}

// ── Profile-aware access helpers ──────────────────────────────────────────────

export function isModelAccessible(profile: Profile, model: Model): boolean {
  return profile.access[model.tier] !== undefined;
}

export function getAccessibleModels(profile: Profile): Model[] {
  return MODELS.filter((m) => isModelAccessible(profile, m));
}

// Max effort allowed for a model under a profile, or null if inaccessible.
export function getMaxEffortForModel(
  profile: Profile,
  model: Model
): Effort | null {
  return profile.access[model.tier] ?? null;
}

// Highest effort reachable by any accessible model in the profile (Auto mode).
export function getMaxEffortForProfile(profile: Profile): Effort {
  const efforts = Object.values(profile.access);
  if (efforts.length === 0) {
    return "light";
  }
  return efforts.reduce((max, e) =>
    effortRank(e) > effortRank(max) ? e : max
  );
}

// Whether a given effort is within the model's cap under the profile.
export function isEffortAllowedForModel(
  profile: Profile,
  model: Model,
  effort: Effort
): boolean {
  const cap = getMaxEffortForModel(profile, model);
  return cap !== null && effortRank(effort) <= effortRank(cap);
}

const MAX_RECOMMENDED = 3;

export function getGroupedModelsByProvider(
  provider: ModelProviderId,
  profile?: Profile
): {
  recommended: Model[];
  legacy: Model[];
} {
  const models = getModelsByProvider(provider).filter(
    (m) => !profile || isModelAccessible(profile, m)
  );
  const recommended = models.filter((m) => !m.legacy).slice(0, MAX_RECOMMENDED);
  const recommendedIds = new Set(recommended.map((m) => m.id));
  const legacy = models.filter((m) => !recommendedIds.has(m.id));
  return { recommended, legacy };
}
