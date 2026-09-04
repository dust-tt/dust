import type { StaticModelIdType } from "@app/types/assistant/models/models";
import { isStaticModelId } from "@app/types/assistant/models/models";
import { STATIC_MODEL_SUPPORTED_REASONING_EFFORTS } from "@app/types/assistant/models/static_model_reasoning_efforts";
import type {
  ModelConfigurationType,
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

// Single source of truth for how tiers are named to users. The same three words
// name the model-picker streams (`auto_fast`/`auto`/`auto_complex`) and the
// analytics usage filter, so a tier means the same thing everywhere.
const MODELS_TIER_DISPLAY_NAMES: Record<ModelsTierName, string> = {
  cost_efficient: "Basic",
  balanced: "Standard",
  premium: "Premium",
};

export function getModelsTierDisplayName(tierName: ModelsTierName): string {
  return MODELS_TIER_DISPLAY_NAMES[tierName];
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
    description: "Lower-cost models for routine tasks.",
  },
  {
    id: 2,
    name: "balanced",
    description: "Balanced models for most tasks.",
  },
  {
    id: 3,
    name: "premium",
    description: "More capable models for complex or demanding work.",
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
  "gpt-5.6-terra-long-context": {
    none: "premium",
    light: "premium",
    medium: "premium",
    high: "premium",
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
    light: "cost_efficient",
    medium: "balanced",
    high: "premium",
  },
  "gemini-3.7-flash": {
    light: "balanced",
    medium: "balanced",
    high: "premium",
  },
  "gemini-3.8-flash": {
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
  "accounts/fireworks/models/glm-5p3-flash": {
    light: "cost_efficient",
    medium: "cost_efficient",
    high: "cost_efficient",
  },
  "accounts/fireworks/models/inkling": {
    light: "balanced",
    medium: "balanced",
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
    medium: "balanced",
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
  // Streams are meta-models: they never bill at their own tier, they resolve to
  // a concrete candidate at message-send time. They are tiered as the tier they
  // are named after, so a member capped below a stream cannot pick it at all —
  // rather than picking it and silently getting a cheaper model.
  auto: {
    none: "balanced",
  },
  auto_fast: {
    none: "cost_efficient",
  },
  auto_complex: {
    none: "premium",
  },
} satisfies StaticModelTiersMap;

export function listTiers(): readonly ModelsTierDefinition[] {
  return MODELS_TIERS;
}

export function getTier(name: ModelsTierName): ModelsTierDefinition | null {
  return MODELS_TIERS.find((tier) => tier.name === name) ?? null;
}

export function getTierForSelection(
  selection: ModelTierSelection
): ModelsTierName | null {
  return getTierForModel(selection.modelId, selection.reasoningEffort);
}

export function getTierForModel(
  modelId: ModelTierSelection["modelId"],
  reasoningEffort: ModelTierSelection["reasoningEffort"]
): ModelsTierName | null {
  // includes models added at runtime on GCP (EAPs)
  if (!isStaticModelId(modelId)) {
    return "premium";
  }
  return STATIC_MODEL_TIERS[modelId][reasoningEffort] ?? null;
}

// A stored selection can carry a reasoning effort its model maps to no tier
// (e.g. an effort kept from a previous model after switching to a stream);
// fall back to the model's default effort rather than resolving no effort.
export function getTieredReasoningEffort(
  model: ModelConfigurationType,
  reasoningEffort?: ReasoningEffort
): ReasoningEffort {
  if (reasoningEffort && getTierForModel(model.modelId, reasoningEffort)) {
    return reasoningEffort;
  }

  return model.defaultReasoningEffort;
}

export function getTierForModelConfiguration(
  model: ModelConfigurationType,
  reasoningEffort?: ReasoningEffort
): ModelsTierName | null {
  return getTierForModel(
    model.modelId,
    getTieredReasoningEffort(model, reasoningEffort)
  );
}
