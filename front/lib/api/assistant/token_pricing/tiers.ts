import { STATIC_MODEL_SUPPORTED_REASONING_EFFORTS } from "@app/lib/api/assistant/token_pricing/static_model_reasoning_efforts";
import type { StaticModelIdType } from "@app/types/assistant/models/models";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
  ReasoningEffortSupport,
} from "@app/types/assistant/models/types";

export const MODELS_TIER_NAMES = [
  "cost_efficient",
  "balanced",
  "premium",
] as const;

export type ModelsTierName = (typeof MODELS_TIER_NAMES)[number];

export function isModelsTierName(value: unknown): value is ModelsTierName {
  return MODELS_TIER_NAMES.includes(value as ModelsTierName);
}

export type ModelTierSelection = {
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  reasoningEffort: ReasoningEffort;
};

export type ModelsTierDefinition = {
  id: number;
  name: ModelsTierName;
  description: string;
};

export const MODELS_TIERS: readonly ModelsTierDefinition[] = [
  {
    id: 1,
    name: "cost_efficient",
    description:
      "Cost efficient models sacrificing on performance to cut on price while remaining acceptable to use Dust with.",
  },
  {
    id: 2,
    name: "balanced",
    description:
      "Standard, everyday workhorse models with a good quality for everyday tasks",
  },
  {
    id: 3,
    name: "premium",
    description:
      "Higher-cost model combinations for demanding work that needs stronger capabilities.",
  },
] as const;

type SupportedReasoningEfforts<S extends ReasoningEffortSupport> = {
  [E in ReasoningEffort]: S[E] extends true ? E : never;
}[ReasoningEffort];

type StaticModelTierByReasoningEffort<
  S extends ReasoningEffortSupport = ReasoningEffortSupport,
> = {
  [E in SupportedReasoningEfforts<S>]: ModelsTierName;
};

type StaticModelTiersMap = {
  [M in StaticModelIdType]: StaticModelTierByReasoningEffort<
    (typeof STATIC_MODEL_SUPPORTED_REASONING_EFFORTS)[M]
  >;
};

type StaticModelTiersLookup = Record<
  StaticModelIdType,
  Partial<Record<ReasoningEffort, ModelsTierName>>
>;

export { STATIC_MODEL_SUPPORTED_REASONING_EFFORTS };

// Tier assignment per static model and supported reasoning effort. Must list every
// StaticModelIdType and every effort from STATIC_MODEL_SUPPORTED_REASONING_EFFORTS.
export const STATIC_MODEL_TIERS: StaticModelTiersLookup = {
  "gpt-3.5-turbo": {
    none: "cost_efficient",
  },
  "gpt-4-turbo": {
    none: "cost_efficient",
  },
  "gpt-4o": {
    none: "cost_efficient",
  },
  "gpt-4.1-2025-04-14": {
    none: "cost_efficient",
  },
  "gpt-4.1-mini-2025-04-14": {
    none: "cost_efficient",
  },
  "gpt-4o-2024-08-06": {
    none: "cost_efficient",
  },
  "gpt-4o-mini": {
    none: "cost_efficient",
  },
  "gpt-5.1": {
    none: "balanced",
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "gpt-5.2": {
    none: "balanced",
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "gpt-5.4-mini": {
    none: "cost_efficient",
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "gpt-5.4": {
    none: "balanced",
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "gpt-5.5": {
    none: "balanced",
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "gpt-5.6-sol": {
    none: "balanced",
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "gpt-5.6-terra": {
    none: "balanced",
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "gpt-5.6-luna": {
    none: "cost_efficient",
    light: "cost_efficient",
    medium: "balanced",
    high: "balanced",
  },
  "gpt-5.4-nano": {
    none: "cost_efficient",
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "gpt-5": {
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "gpt-5-mini": {
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "gpt-5-nano": {
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  o1: {
    none: "premium",
  },
  "o1-mini": {
    none: "premium",
  },
  o3: {
    medium: "premium",
    high: "premium",
  },
  "o3-mini": {
    medium: "balanced",
    high: "balanced",
  },
  "o4-mini": {
    medium: "balanced",
    high: "balanced",
  },
  "claude-4-opus-20250514": {
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "claude-4-sonnet-20250514": {
    light: "cost_efficient",
    medium: "balanced",
    high: "premium",
  },
  "claude-sonnet-4-5-20250929": {
    light: "cost_efficient",
    medium: "balanced",
    high: "premium",
  },
  "claude-opus-4-5-20251101": {
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "claude-opus-4-6": {
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "claude-opus-4-7": {
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "claude-opus-4-8": {
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "claude-opus-5": {
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "claude-fable-5": {
    light: "premium",
    medium: "premium",
    high: "premium",
  },
  "claude-sonnet-5": {
    light: "cost_efficient",
    medium: "balanced",
    high: "premium",
  },
  "claude-sonnet-4-6": {
    light: "cost_efficient",
    medium: "balanced",
    high: "premium",
  },
  "claude-3-opus-20240229": {
    light: "premium",
  },
  "claude-3-5-sonnet-20240620": {
    light: "cost_efficient",
  },
  "claude-3-5-sonnet-20241022": {
    light: "cost_efficient",
  },
  "claude-3-7-sonnet-20250219": {
    light: "cost_efficient",
  },
  "claude-3-haiku-20240307": {
    light: "cost_efficient",
  },
  "claude-3-5-haiku-20241022": {
    light: "cost_efficient",
  },
  "claude-haiku-4-5-20251001": {
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "mistral-large-latest": {
    none: "balanced",
  },
  "mistral-medium": {
    none: "balanced",
  },
  "mistral-medium-3-5": {
    none: "balanced",
    high: "premium",
  },
  "mistral-small-latest": {
    none: "cost_efficient",
  },
  "codestral-latest": {
    none: "cost_efficient",
  },
  "gemini-2.5-flash": {
    none: "balanced",
    light: "balanced",
  },
  "gemini-2.5-flash-lite": {
    none: "cost_efficient",
    light: "cost_efficient",
  },
  "gemini-2.5-pro": {
    light: "balanced",
    medium: "premium",
    high: "premium",
  },
  "gemini-3-pro-preview": {
    light: "balanced",
    medium: "premium",
    high: "premium",
  },
  "gemini-3.1-flash-lite": {
    none: "cost_efficient",
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "balanced",
  },
  "gemini-3.5-flash-lite": {
    none: "cost_efficient",
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "balanced",
  },
  "gemini-3.1-flash-lite-preview": {
    none: "cost_efficient",
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "balanced",
  },
  "gemini-3.1-pro-preview": {
    light: "balanced",
    medium: "premium",
    high: "premium",
  },
  "gemini-3-flash-preview": {
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "gemini-3.5-flash": {
    light: "balanced",
    medium: "balanced",
    high: "premium",
  },
  "gemini-3.6-flash": {
    light: "balanced",
    medium: "balanced",
    high: "premium",
  },
  "gemini-3.7-flash": {
    light: "balanced",
    medium: "balanced",
    high: "premium",
  },
  "deepseek-chat": {
    none: "cost_efficient",
  },
  "accounts/fireworks/models/deepseek-v3p2": {
    none: "cost_efficient",
  },
  "accounts/fireworks/models/deepseek-v4-pro": {
    none: "balanced",
  },
  "accounts/fireworks/models/deepseek-v4-flash-0731": {
    none: "cost_efficient",
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "accounts/fireworks/models/kimi-k2-instruct-0905": {
    light: "balanced",
  },
  "accounts/fireworks/models/kimi-k2p5": {
    none: "balanced",
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "accounts/fireworks/models/kimi-k2p6": {
    none: "balanced",
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "accounts/fireworks/models/kimi-k3": {
    light: "balanced",
    medium: "premium",
    high: "premium",
  },
  "accounts/fireworks/models/minimax-m2p5": {
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "accounts/fireworks/models/glm-5": {
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "accounts/fireworks/models/glm-5p2": {
    high: "balanced",
  },
  "grok-3-latest": {
    none: "balanced",
  },
  "grok-3-mini-latest": {
    none: "cost_efficient",
  },
  "grok-4.5": {
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "grok-4.6": {
    light: "balanced",
    medium: "premium",
    high: "premium",
  },
  "grok-4-latest": {
    none: "balanced",
    light: "balanced",
    medium: "balanced",
    high: "balanced",
  },
  "grok-4-fast-reasoning-latest": {
    none: "balanced",
  },
  "grok-4-fast-non-reasoning-latest": {
    none: "balanced",
  },
  "grok-4-1-fast-non-reasoning-latest": {
    none: "balanced",
  },
  "grok-4-1-fast-reasoning-latest": {
    none: "balanced",
  },
  noop: {
    none: "balanced",
  },
  auto: {
    none: "balanced",
  },
  auto_fast: {
    none: "balanced",
  },
  auto_complex: {
    none: "balanced",
  },
} satisfies StaticModelTiersMap;
