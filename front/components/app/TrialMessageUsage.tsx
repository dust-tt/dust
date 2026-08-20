import { AGENT_MESSAGE_COMPLETED_EVENT } from "@app/lib/notifications/events";
import { useTrialMessageUsage } from "@app/lib/swr/trial_message_usage";
import { Button, cn, LinkWrapper, ProgressBar } from "@dust-tt/sparkle";
import { useEffect } from "react";

const MESSAGE_USAGE_CRITICAL_THRESHOLD = 0.9;
const DISPLAY_WHEN_REMAINING_BELOW = 90;

interface TrialMessageUsageProps {
  isAdmin: boolean;
  workspaceId: string;
}

export function TrialMessageUsage({
  isAdmin,
  workspaceId,
}: TrialMessageUsageProps) {
  const { messageUsage, mutateMessageUsage } = useTrialMessageUsage({
    workspaceId,
  });

  useEffect(() => {
    const handleAgentMessageCompleted = () => {
      void mutateMessageUsage();
    };
    window.addEventListener(
      AGENT_MESSAGE_COMPLETED_EVENT,
      handleAgentMessageCompleted
    );
    return () => {
      window.removeEventListener(
        AGENT_MESSAGE_COMPLETED_EVENT,
        handleAgentMessageCompleted
      );
    };
  }, [mutateMessageUsage]);

  if (!messageUsage || messageUsage.limit === -1) {
    return null;
  }

  const { count, limit } = messageUsage;
  if (limit <= 0) {
    return null;
  }

  const remaining = Math.max(limit - count, 0);
  if (remaining >= DISPLAY_WHEN_REMAINING_BELOW) {
    return null;
  }

  const percentage = limit > 0 ? count / limit : 0;
  const isCritical = percentage >= MESSAGE_USAGE_CRITICAL_THRESHOLD;
  const isAtLimit = count >= limit;

  return (
    <div
      className={cn("rounded-lg border p-3", "border-border", "bg-background")}
    >
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground">
          Trial messages used
        </span>
        <span className="font-medium text-foreground">
          <span className={cn(isCritical && "text-warning-600")}>{count}</span>{" "}
          / {limit}
        </span>
      </div>
      <ProgressBar
        className="h-2 w-full bg-primary-100"
        values={[
          {
            value: Math.min(percentage * 100, 100),
            className: isCritical ? "bg-warning-700" : "bg-foreground",
          },
          {
            value: 100 - Math.min(percentage * 100, 100),
            className: "bg-transparent",
          },
        ]}
      />
      {isAtLimit && isAdmin && (
        <div className="mt-3">
          <LinkWrapper
            href={`/w/${workspaceId}/subscription`}
            className="no-underline"
          >
            <Button label="Subscribe to Dust" variant="primary" />
          </LinkWrapper>
        </div>
      )}
    </div>
  );
}
