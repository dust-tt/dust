import type { TriggerStatus } from "@app/types/assistant/triggers";
import { Chip } from "@dust-tt/sparkle";
import type React from "react";

type ChipColor = React.ComponentProps<typeof Chip>["color"];

const STATUS_CHIP_COLORS: Record<TriggerStatus, ChipColor> = {
  enabled: "success",
  disabled: "primary",
  disabled_by_admin: "warning",
  relocating: "info",
  downgraded: "warning",
};

export const TRIGGER_STATUS_LABELS: Record<TriggerStatus, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  disabled_by_admin: "Locked",
  relocating: "Relocating",
  downgraded: "Downgraded",
};

interface TriggerStatusChipProps {
  status: TriggerStatus;
}

export function TriggerStatusChip({ status }: TriggerStatusChipProps) {
  return (
    <Chip size="xs" color={STATUS_CHIP_COLORS[status]}>
      {TRIGGER_STATUS_LABELS[status]}
    </Chip>
  );
}
