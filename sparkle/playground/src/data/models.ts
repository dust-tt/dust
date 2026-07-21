import { AnthropicLogo, MistralLogo, OpenaiLogo } from "@dust-tt/sparkle";
import type { ComponentType, SVGProps } from "react";

export type ModelProviderId = "anthropic" | "openai" | "mistral";

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
  legacy?: boolean;
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  { id: "anthropic", name: "Anthropic", icon: AnthropicLogo },
  { id: "openai", name: "OpenAI", icon: OpenaiLogo },
  { id: "mistral", name: "Mistral", icon: MistralLogo },
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
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    description: "Latest balanced Claude for everyday work.",
    provider: "anthropic",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude 4.5 Haiku",
    description: "Fast and lightweight Claude.",
    provider: "anthropic",
  },
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    description: "Previous flagship Opus generation.",
    provider: "anthropic",
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    description: "High-capability Opus model.",
    provider: "anthropic",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "Balanced Sonnet model.",
    provider: "anthropic",
  },
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude 4.5 Opus",
    description: "Powerful reasoning Opus model.",
    provider: "anthropic",
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude 4.5 Sonnet",
    description: "Reliable general-purpose Sonnet.",
    provider: "anthropic",
  },
  {
    id: "claude-4-opus-20250514",
    name: "Claude 4 Opus",
    description: "First-generation Claude 4 Opus.",
    provider: "anthropic",
    legacy: true,
  },
  {
    id: "claude-4-sonnet-20250514",
    name: "Claude 4 Sonnet",
    description: "First-generation Claude 4 Sonnet.",
    provider: "anthropic",
    legacy: true,
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    id: "gpt-5.6-sol",
    name: "GPT 5.6 Sol",
    description: "OpenAI's most advanced model.",
    provider: "openai",
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT 5.6 Terra",
    description: "High-capability GPT 5.6 variant.",
    provider: "openai",
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT 5.6 Luna",
    description: "Efficient GPT 5.6 variant.",
    provider: "openai",
  },
  {
    id: "gpt-5.5",
    name: "GPT 5.5",
    description: "Previous flagship GPT generation.",
    provider: "openai",
  },
  {
    id: "gpt-5.4",
    name: "GPT 5.4",
    description: "Capable GPT 5 model.",
    provider: "openai",
  },
  {
    id: "gpt-5.2",
    name: "GPT 5.2",
    description: "General-purpose GPT 5 model.",
    provider: "openai",
    legacy: true,
  },
  {
    id: "gpt-5.1",
    name: "GPT 5.1",
    description: "General-purpose GPT 5 model.",
    provider: "openai",
    legacy: true,
  },
  {
    id: "gpt-5",
    name: "GPT 5",
    description: "First-generation GPT 5.",
    provider: "openai",
    legacy: true,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Fast and affordable GPT 5.",
    provider: "openai",
    legacy: true,
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    description: "Smallest and fastest GPT 5.",
    provider: "openai",
    legacy: true,
  },

  // ── Mistral ────────────────────────────────────────────────────────────
  {
    id: "mistral-large-latest",
    name: "Mistral Large",
    description: "Mistral's flagship model.",
    provider: "mistral",
  },
  {
    id: "mistral-medium-3-5",
    name: "Mistral Medium 3.5",
    description: "Balanced Mistral model with reasoning.",
    provider: "mistral",
  },
  {
    id: "mistral-small-latest",
    name: "Mistral Small",
    description: "Lightweight and fast Mistral model.",
    provider: "mistral",
    legacy: true,
  },
  {
    id: "codestral-latest",
    name: "Mistral Codestral",
    description: "Mistral's code-specialized model.",
    provider: "mistral",
    legacy: true,
  },
];

export function getModelsByProvider(provider: ModelProviderId): Model[] {
  return MODELS.filter((m) => m.provider === provider);
}

const MAX_RECOMMENDED = 3;

export function getGroupedModelsByProvider(provider: ModelProviderId): {
  recommended: Model[];
  legacy: Model[];
} {
  const models = getModelsByProvider(provider);
  const recommended = models.filter((m) => !m.legacy).slice(0, MAX_RECOMMENDED);
  const recommendedIds = new Set(recommended.map((m) => m.id));
  const legacy = models.filter((m) => !recommendedIds.has(m.id));
  return { recommended, legacy };
}
