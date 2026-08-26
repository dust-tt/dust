import type { FeatureFlagStage } from "@app/types/shared/feature_flags";
import {
  FEATURE_FLAG_STAGE_DESCRIPTIONS,
  FEATURE_FLAG_STAGE_LABELS,
} from "@app/types/shared/feature_flags";
import { Chip, Tooltip } from "@dust-tt/sparkle";

interface FeatureFlagStageChipProps {
  // `null` for flag rows whose name is no longer in WHITELISTABLE_FEATURES_CONFIG.
  stage: FeatureFlagStage | null;
  // GitHub handle of the eng owner, for `ask_owner` flags.
  owner?: string | null;
}

export function FeatureFlagStageChip({
  stage,
  owner,
}: FeatureFlagStageChipProps) {
  if (!stage) {
    return (
      <Chip color="info" size="xs">
        Legacy
      </Chip>
    );
  }

  const warningStages: FeatureFlagStage[] = ["dust_only", "ask_owner"];

  const tooltipLabel = owner
    ? `${FEATURE_FLAG_STAGE_DESCRIPTIONS[stage]}\nOwner: @${owner}`
    : FEATURE_FLAG_STAGE_DESCRIPTIONS[stage];

  return (
    <Tooltip
      trigger={
        <Chip
          color={warningStages.includes(stage) ? "warning" : "highlight"}
          size="xs"
        >
          {FEATURE_FLAG_STAGE_LABELS[stage]}
        </Chip>
      }
      label={tooltipLabel}
    />
  );
}
