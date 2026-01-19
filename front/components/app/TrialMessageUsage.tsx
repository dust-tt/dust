import { Button, cn } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect } from "react";

import { AGENT_MESSAGE_COMPLETED_EVENT } from "@app/lib/notifications/events";
import { useTrialMessageUsage } from "@app/lib/swr/trial_message_usage";

const MESSAGE_USAGE_CRITICAL_THRESHOLD = 0.9;

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
  const percentage = limit > 0 ? count / limit : 0;
  const isCritical = percentage >= MESSAGE_USAGE_CRITICAL_THRESHOLD;
  const isAtLimit = count >= limit;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        "border-border dark:border-border-night",
        "bg-background dark:bg-background-night"
      )}
    >
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground dark:text-foreground-night">
          Trial messages used
        </span>
        <span className="font-medium text-foreground dark:text-foreground-night">
          <span className={cn(isCritical && "text-red-600 dark:text-red-400")}>
            {count}
          </span>{" "}
          / {limit}
        </span>
      </div>
      <div
        className={cn(
          "h-2 w-full overflow-hidden rounded-full",
          "bg-gray-100 dark:bg-gray-100-night"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isCritical
              ? "bg-red-700 dark:bg-red-700-night"
              : "bg-foreground dark:bg-foreground-night"
          )}
          style={{ width: `${Math.min(percentage * 100, 100)}%` }}
        />
      </div>
      {isAtLimit && isAdmin && (
        <div className="mt-3">
          <Link
            href={`/w/${workspaceId}/subscription`}
            className="no-underline"
          >
            <Button label="Subscribe to Dust" variant="primary" />
          </Link>
        </div>
      )}
    </div>
  );
}
