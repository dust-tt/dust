import { getTierIndex } from "@app/lib/model_tiers/tier_order";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  getModelsTierDisplayName,
  MODELS_TIERS,
  STATIC_MODEL_TIERS,
} from "@app/types/assistant/models/model_tiers";
import { isStaticModelId } from "@app/types/assistant/models/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { USED_MODEL_CONFIGS } from "@app/types/assistant/models/used_model_configs";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

export interface ModelTierExplainerEntry {
  displayName: string;
  effortsLabel: string;
}

export interface ModelTierExplainerTier {
  name: ModelsTierName;
  displayName: string;
  description: string;
  priceLevel: number;
  models: ModelTierExplainerEntry[];
}

const HIDDEN_PROVIDER_IDS = new Set(["auto", "noop"]);

const TIER_DESCRIPTIONS: Record<ModelsTierName, MessageDescriptor> = {
  cost_efficient: msg`Lower-cost models for routine tasks.`,
  balanced: msg`Balanced models for most tasks.`,
  premium: msg`More capable models for complex or demanding work.`,
  ultra: msg`Frontier models priced far above Premium, for the most demanding work.`,
};

function formatEffortsLabel(
  inTierEfforts: ReasoningEffort[],
  supportedEfforts: ReasoningEffort[],
  t: Translate,
  getEffortLabel: (effort: ReasoningEffort) => string
): string {
  if (
    inTierEfforts.length === supportedEfforts.length &&
    supportedEfforts.length > 1
  ) {
    return t(msg`all efforts`);
  }

  return inTierEfforts.map(getEffortLabel).join(" · ");
}

export function getModelTierExplainer(
  availableModelIds: Set<string>,
  t: Translate,
  getEffortLabel: (effort: ReasoningEffort) => string
): ModelTierExplainerTier[] {
  return MODELS_TIERS.map((tier) => {
    const models: ModelTierExplainerEntry[] = [];

    for (const config of USED_MODEL_CONFIGS) {
      if (
        !availableModelIds.has(config.modelId) ||
        HIDDEN_PROVIDER_IDS.has(config.providerId) ||
        isModelStreamId(config.modelId) ||
        !isStaticModelId(config.modelId)
      ) {
        continue;
      }

      const tiersByEffort = STATIC_MODEL_TIERS[config.modelId];
      const supportedEfforts = getAvailableReasoningEfforts(
        config.supportedReasoningEfforts
      );
      const inTierEfforts = supportedEfforts.filter(
        (effort) => tiersByEffort[effort] === tier.name
      );
      if (inTierEfforts.length === 0) {
        continue;
      }

      models.push({
        displayName: config.displayName,
        effortsLabel: formatEffortsLabel(
          inTierEfforts,
          supportedEfforts,
          t,
          getEffortLabel
        ),
      });
    }

    return {
      name: tier.name,
      displayName: getModelsTierDisplayName(tier.name),
      description: t(TIER_DESCRIPTIONS[tier.name]),
      priceLevel: getTierIndex(tier.name) + 1,
      models,
    };
  });
}
