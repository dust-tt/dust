import { MODELS_TIER_DISPLAY_NAMES } from "@app/components/model_picker/modelPickerUtils";
import { getTierForModelConfiguration } from "@app/types/assistant/models/model_tiers";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { Chip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface ModelTierChipProps {
  model: ModelConfigurationType;
  reasoningEffort?: ReasoningEffort;
}

export function ModelTierChip({ model, reasoningEffort }: ModelTierChipProps) {
  const { t } = useLingui();
  const tier = getTierForModelConfiguration(model, reasoningEffort);
  if (!tier) {
    return null;
  }

  return <Chip size="mini" label={t(MODELS_TIER_DISPLAY_NAMES[tier])} />;
}
