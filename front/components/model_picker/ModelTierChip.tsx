import {
  getModelsTierDisplayName,
  getTierForModelConfiguration,
} from "@app/types/assistant/models/model_tiers";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { Chip } from "@dust-tt/sparkle";

interface ModelTierChipProps {
  model: ModelConfigurationType;
  reasoningEffort?: ReasoningEffort;
}

export function ModelTierChip({ model, reasoningEffort }: ModelTierChipProps) {
  const tier = getTierForModelConfiguration(model, reasoningEffort);
  if (!tier) {
    return null;
  }

  return <Chip size="mini" label={getModelsTierDisplayName(tier)} />;
}
