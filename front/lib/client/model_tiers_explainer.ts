import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import {
  getModelsTierDisplayName,
  MODELS_TIERS,
  STATIC_MODEL_TIERS,
} from "@app/lib/api/assistant/token_pricing/tiers";
import { getTierIndex } from "@app/lib/model_tiers/tier_order";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { isStaticModelId } from "@app/types/assistant/models/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { USED_MODEL_CONFIGS } from "@app/types/assistant/models/used_model_configs";

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

function formatEffortsLabel(
  inTierEfforts: ReasoningEffort[],
  supportedEfforts: ReasoningEffort[]
): string {
  if (
    inTierEfforts.length === supportedEfforts.length &&
    supportedEfforts.length > 1
  ) {
    return "all efforts";
  }

  return inTierEfforts.join(" · ");
}

export function getModelTierExplainer(): ModelTierExplainerTier[] {
  return MODELS_TIERS.map((tier) => {
    const models: ModelTierExplainerEntry[] = [];

    for (const config of USED_MODEL_CONFIGS) {
      if (
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
        effortsLabel: formatEffortsLabel(inTierEfforts, supportedEfforts),
      });
    }

    return {
      name: tier.name,
      displayName: getModelsTierDisplayName(tier.name),
      description: tier.description,
      priceLevel: getTierIndex(tier.name) + 1,
      models,
    };
  });
}
