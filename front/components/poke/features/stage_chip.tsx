import {
  FEATURE_FLAG_STAGE_DESCRIPTIONS,
  FEATURE_FLAG_STAGE_LABELS,
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { Chip, Tooltip } from "@dust-tt/sparkle";

interface FeatureFlagStageChipProps {
  // A name no longer in WHITELISTABLE_FEATURES_CONFIG renders as a legacy chip.
  flagName: string;
}

export function FeatureFlagStageChip({ flagName }: FeatureFlagStageChipProps) {
  if (!isWhitelistableFeature(flagName)) {
    return (
      <Chip color="info" size="xs">
        Legacy
      </Chip>
    );
  }

  const { stage, owner } = WHITELISTABLE_FEATURES_CONFIG[flagName];
  const isWarningStage = stage === "dust_only" || stage === "ask_owner";

  return (
    <Tooltip
      trigger={
        <Chip color={isWarningStage ? "warning" : "highlight"} size="xs">
          {FEATURE_FLAG_STAGE_LABELS[stage]}
        </Chip>
      }
      label={`${FEATURE_FLAG_STAGE_DESCRIPTIONS[stage]}\nOwner: @${owner}`}
    />
  );
}
