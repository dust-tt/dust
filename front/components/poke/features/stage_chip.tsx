import type { FeatureFlagStage } from "@app/types/shared/feature_flags";
import { FEATURE_FLAG_STAGE_LABELS } from "@app/types/shared/feature_flags";
import { Chip } from "@dust-tt/sparkle";

interface FeatureFlagStageChipProps {
  // `null` for flag rows whose name is no longer in WHITELISTABLE_FEATURES_CONFIG.
  stage: FeatureFlagStage | null;
}

export function FeatureFlagStageChip({ stage }: FeatureFlagStageChipProps) {
  if (!stage) {
    return (
      <Chip color="info" size="xs">
        Legacy
      </Chip>
    );
  }

  const warningStages: FeatureFlagStage[] = ["dust_only", "rolling_out"];

  return (
    <Chip
      color={warningStages.includes(stage) ? "warning" : "highlight"}
      size="xs"
    >
      {FEATURE_FLAG_STAGE_LABELS[stage]}
    </Chip>
  );
}
