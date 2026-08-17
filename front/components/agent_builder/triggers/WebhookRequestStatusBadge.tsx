import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import { Chip } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

interface WebhookRequestStatusBadgeProps {
  status: WebhookRequestTriggerStatus;
}

export function WebhookRequestStatusBadge({
  status,
}: WebhookRequestStatusBadgeProps) {
  const statusConfig: Record<
    WebhookRequestTriggerStatus,
    { label: string; variant: ComponentProps<typeof Chip>["color"] }
  > = {
    workflow_start_succeeded: {
      label: "Succeeded",
      variant: "success",
    },
    workflow_start_failed: {
      label: "Failed",
      variant: "warning",
    },
    not_matched: {
      label: "Not Matched",
      variant: "info",
    },
    rate_limited: {
      label: "Rate Limited",
      variant: "warning",
    },
    credits_exhausted: {
      label: "Out Of Credits",
      variant: "warning",
    },
  };

  const config = statusConfig[status] ?? { label: status, variant: "info" };

  return (
    <Chip
      color={config.variant}
      size="xs"
      label={config.label}
      className="select-none"
    />
  );
}
