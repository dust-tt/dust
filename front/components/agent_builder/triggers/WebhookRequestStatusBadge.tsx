import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import { Chip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";

interface WebhookRequestStatusBadgeProps {
  status: WebhookRequestTriggerStatus;
}

export function WebhookRequestStatusBadge({
  status,
}: WebhookRequestStatusBadgeProps) {
  const { t } = useLingui();
  const statusConfig: Record<
    WebhookRequestTriggerStatus,
    { label: string; variant: ComponentProps<typeof Chip>["color"] }
  > = {
    workflow_start_succeeded: {
      label: t`Succeeded`,
      variant: "success",
    },
    workflow_start_failed: {
      label: t`Failed`,
      variant: "warning",
    },
    not_matched: {
      label: t`Not matched`,
      variant: "info",
    },
    rate_limited: {
      label: t`Rate limited`,
      variant: "warning",
    },
    credits_exhausted: {
      label: t`Out of credits`,
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
