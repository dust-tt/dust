import {
  MODELS_TIER_NAMES,
  MODELS_TIERS,
  type ModelsTierDefinition,
  type ModelsTierName,
  type ModelTierSelection,
  STATIC_MODEL_TIERS,
} from "@app/lib/api/assistant/token_pricing/tiers";

export type {
  ModelsTierDefinition,
  ModelsTierName,
  ModelTierSelection,
} from "@app/lib/api/assistant/token_pricing/tiers";

export class ModelsTierResource {
  static readonly TIERS = MODELS_TIERS;

  static readonly TIER_NAMES = MODELS_TIER_NAMES;

  static listTiers(): readonly ModelsTierDefinition[] {
    return MODELS_TIERS;
  }

  static getTier(name: ModelsTierName): ModelsTierDefinition | null {
    return MODELS_TIERS.find((tier) => tier.name === name) ?? null;
  }

  static getTierForSelection(
    selection: ModelTierSelection
  ): ModelsTierName | null {
    return (
      STATIC_MODEL_TIERS[selection.modelId][selection.reasoningEffort] ?? null
    );
  }

  static getTierForModel(
    modelId: ModelTierSelection["modelId"],
    reasoningEffort: ModelTierSelection["reasoningEffort"]
  ): ModelsTierName | null {
    return STATIC_MODEL_TIERS[modelId][reasoningEffort] ?? null;
  }
}
