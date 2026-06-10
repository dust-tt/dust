import { formatCredits } from "@app/lib/client/credits";
import { AGENT_MESSAGE_COMPLETED_EVENT } from "@app/lib/notifications/events";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import { cn } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

const CREDITS_USAGE_DISPLAY_THRESHOLD = 0.75;
const CREDITS_USAGE_CRITICAL_THRESHOLD = 0.9;

// Credit accounting runs asynchronously after message completion; give it time to land before
// refreshing the gauge.
const MUTATE_DELAY_MS = 3000;

interface FairUseCreditsUsageProps {
  workspaceId: string;
}

export function FairUseCreditsUsage({
  workspaceId,
}: FairUseCreditsUsageProps) {
  const { fairUseAwuCreditsState, mutateFairUseCredits } = useFairUseCredits({
    workspaceId,
  });

  const mutateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleAgentMessageCompleted = () => {
      if (mutateTimeoutRef.current) {
        clearTimeout(mutateTimeoutRef.current);
      }
      mutateTimeoutRef.current = setTimeout(() => {
        mutateTimeoutRef.current = null;
        void mutateFairUseCredits();
      }, MUTATE_DELAY_MS);
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
      if (mutateTimeoutRef.current) {
        clearTimeout(mutateTimeoutRef.current);
      }
    };
  }, [mutateFairUseCredits]);

  // Covers the unlimited (-1) sentinel as well as degenerate limits.
  if (!fairUseAwuCreditsState || fairUseAwuCreditsState.limit <= 0) {
    return null;
  }

  const { count, limit } = fairUseAwuCreditsState;
  const percentage = count / limit;
  if (percentage < CREDITS_USAGE_DISPLAY_THRESHOLD) {
    return null;
  }

  const isCritical = percentage >= CREDITS_USAGE_CRITICAL_THRESHOLD;

  return (
    <div
      className={cn(
        // Spacing lives here rather than on a wrapper so that it only applies when the gauge is
        // actually visible.
        "mx-3 mb-3",
        "rounded-lg border p-3",
        "border-border dark:border-border-night",
        "bg-background dark:bg-background-night"
      )}
    >
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground dark:text-foreground-night">
          Fair usage
        </span>
        <span className="font-medium text-foreground dark:text-foreground-night">
          <span className={cn(isCritical && "text-red-600 dark:text-red-400")}>
            {formatCredits(count)}
          </span>{" "}
          / {formatCredits(limit)} cr.
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
    </div>
  );
}
