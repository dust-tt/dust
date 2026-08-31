import {
  getModelsTierDisplayName,
  getTierForModel,
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

export function ModelTierChip({
  model,
  reasoningEffort = model.defaultReasoningEffort,
}: ModelTierChipProps) {
  // An agent can carry a reasoning effort its model no longer maps to a tier
  // (e.g. "medium" kept from a previous model after switching to "auto");
  // fall back to the model's default effort rather than showing nothing.
  const tier =
    getTierForModel(model.modelId, reasoningEffort) ??
    getTierForModel(model.modelId, model.defaultReasoningEffort);
  if (!tier) {
    return null;
  }

  return <Chip size="mini" label={getModelsTierDisplayName(tier)} />;
}
