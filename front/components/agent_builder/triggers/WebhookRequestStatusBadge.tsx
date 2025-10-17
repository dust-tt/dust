import { Chip } from "@dust-tt/sparkle";

import type { WebhookRequestTriggerStatus } from "@app/lib/models/assistant/triggers/webhook_request_trigger";

interface WebhookRequestStatusBadgeProps {
  status: WebhookRequestTriggerStatus;
}

export function WebhookRequestStatusBadge({
  status,
}: WebhookRequestStatusBadgeProps) {
  const statusConfig: Record<
    WebhookRequestTriggerStatus,
    { label: string; variant: "success" | "warning" | "info" }
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
  };

  const config = statusConfig[status];

  return (
    <Chip
      color={config.variant}
      size="sm"
      label={config.label}
      className="select-none"
    />
  );
}
