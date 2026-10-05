import { CreditUsageCard } from "@app/components/app/CreditUsageCard";
import { FairUsageModal } from "@app/components/FairUsageModal";
import { formatCredits, formatFairUseTimeframe } from "@app/lib/client/credits";
import { AGENT_MESSAGE_COMPLETED_EVENT } from "@app/lib/notifications/events";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import { Hoverable } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

const CREDITS_USAGE_DISPLAY_THRESHOLD = 0.75;
const CREDITS_USAGE_CRITICAL_THRESHOLD = 0.9;

// Credit accounting runs asynchronously after message completion; give it time to land before
// refreshing the gauge.
const MUTATE_DELAY_MS = 3000;

interface FairUseCreditsUsageProps {
  workspaceId: string;
}

export function FairUseCreditsUsage({ workspaceId }: FairUseCreditsUsageProps) {
  const { fairUseAwuCreditsState, mutateFairUseCredits } = useFairUseCredits({
    workspaceId,
  });

  const [isFairUsageModalOpened, setIsFairUsageModalOpened] = useState(false);

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

  const { count, limit, timeframe } = fairUseAwuCreditsState;
  const percentage = count / limit;
  if (percentage < CREDITS_USAGE_DISPLAY_THRESHOLD) {
    return null;
  }

  const isCritical = percentage >= CREDITS_USAGE_CRITICAL_THRESHOLD;
  const timeframeLabel = formatFairUseTimeframe(timeframe);

  return (
    <>
      <FairUsageModal
        isOpened={isFairUsageModalOpened}
        onClose={() => setIsFairUsageModalOpened(false)}
        seatLimit={{ kind: "credits", limit, timeframe }}
      />
      <div className="mx-3 mb-3">
        <CreditUsageCard
          label="Fair usage"
          usedPercentage={Math.round(percentage * 100)}
          tone={isCritical ? "critical" : "elevated"}
          variant="companion"
        >
          {formatCredits(count)} / {formatCredits(limit)} credits
          {timeframeLabel ? ` ${timeframeLabel}` : ""} ·{" "}
          <Hoverable
            variant="highlight"
            onClick={() => setIsFairUsageModalOpened(true)}
          >
            Fair Use policy
          </Hoverable>
        </CreditUsageCard>
      </div>
    </>
  );
}
