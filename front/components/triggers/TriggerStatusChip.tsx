import type { TriggerStatus } from "@app/types/assistant/triggers";
import { Chip } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type React from "react";

type ChipColor = React.ComponentProps<typeof Chip>["color"];

const STATUS_CHIP_COLORS: Record<TriggerStatus, ChipColor> = {
  enabled: "success",
  disabled: "primary",
  disabled_by_manager: "warning",
  relocating: "info",
  downgraded: "warning",
};

export const TRIGGER_STATUS_LABELS: Record<TriggerStatus, MessageDescriptor> = {
  enabled: msg`Enabled`,
  disabled: msg`Disabled`,
  disabled_by_manager: msg`Disabled by manager`,
  relocating: msg`Relocating`,
  downgraded: msg`Downgraded`,
};

interface TriggerStatusChipProps {
  status: TriggerStatus;
}

export function TriggerStatusChip({ status }: TriggerStatusChipProps) {
  const { t } = useLingui();

  return (
    <Chip size="xs" color={STATUS_CHIP_COLORS[status]}>
      {t(TRIGGER_STATUS_LABELS[status])}
    </Chip>
  );
}
