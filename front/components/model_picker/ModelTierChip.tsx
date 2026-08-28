import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  getModelsTierDisplayName,
  getTierForModel,
} from "@app/types/assistant/models/model_tiers";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { Chip } from "@dust-tt/sparkle";
import type React from "react";

type ChipColor = NonNullable<React.ComponentProps<typeof Chip>["color"]>;

const MODEL_TIER_CHIP_COLORS: Record<ModelsTierName, ChipColor> = {
  cost_efficient: "success",
  balanced: "info",
  premium: "warning",
};

interface ModelTierChipProps {
  model: ModelConfigurationType;
  reasoningEffort?: ReasoningEffort;
}

export function ModelTierChip({
  model,
  reasoningEffort = model.defaultReasoningEffort,
}: ModelTierChipProps) {
  const tier = getTierForModel(model.modelId, reasoningEffort);
  if (!tier) {
    return null;
  }

  return (
    <Chip
      size="mini"
      color={MODEL_TIER_CHIP_COLORS[tier]}
      label={getModelsTierDisplayName(tier)}
    />
  );
}
