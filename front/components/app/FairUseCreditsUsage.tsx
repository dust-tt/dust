import { CreditUsageCard } from "@app/components/app/CreditUsageCard";
import { FairUsageModal } from "@app/components/FairUsageModal";
import { formatCredits, roundCredits } from "@app/lib/client/credits";
import { AGENT_MESSAGE_COMPLETED_EVENT } from "@app/lib/notifications/events";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Hoverable } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

const CREDITS_USAGE_DISPLAY_THRESHOLD = 0.75;
const CREDITS_USAGE_CRITICAL_THRESHOLD = 0.9;

// Credit accounting runs asynchronously after message completion; give it time to land before
// refreshing the gauge.
const MUTATE_DELAY_MS = 3000;

type Translate = (descriptor: MessageDescriptor) => string;

function getCreditsUsageLabel(
  used: number,
  limit: number,
  timeframe: MaxAwuCreditsTimeframeType,
  t: Translate
): string {
  const usedCredits = formatCredits(used);
  const limitCredits = formatCredits(limit);
  const displayedLimit = roundCredits(limit);
  switch (timeframe) {
    case "day":
      return t(
        msg`${plural(displayedLimit, {
          one: `${usedCredits} / ${limitCredits} credit per day`,
          other: `${usedCredits} / ${limitCredits} credits per day`,
        })}`
      );
    case "week":
      return t(
        msg`${plural(displayedLimit, {
          one: `${usedCredits} / ${limitCredits} credit per week`,
          other: `${usedCredits} / ${limitCredits} credits per week`,
        })}`
      );
    case "month":
      return t(
        msg`${plural(displayedLimit, {
          one: `${usedCredits} / ${limitCredits} credit per month`,
          other: `${usedCredits} / ${limitCredits} credits per month`,
        })}`
      );
    case "lifetime":
      return t(
        msg`${plural(displayedLimit, {
          one: `${usedCredits} / ${limitCredits} credit`,
          other: `${usedCredits} / ${limitCredits} credits`,
        })}`
      );
    default:
      assertNeverAndIgnore(timeframe);
      return t(
        msg`${plural(displayedLimit, {
          one: `${usedCredits} / ${limitCredits} credit`,
          other: `${usedCredits} / ${limitCredits} credits`,
        })}`
      );
  }
}

interface FairUseCreditsUsageProps {
  workspaceId: string;
}

export function FairUseCreditsUsage({ workspaceId }: FairUseCreditsUsageProps) {
  const { t } = useLingui();
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
  const usageLabel = getCreditsUsageLabel(count, limit, timeframe, t);

  return (
    <>
      <FairUsageModal
        isOpened={isFairUsageModalOpened}
        onClose={() => setIsFairUsageModalOpened(false)}
        seatLimit={{ kind: "credits", limit, timeframe }}
      />
      <div className="mx-3 mb-3">
        <CreditUsageCard
          label={t`Fair usage`}
          usedPercentage={Math.round(percentage * 100)}
          tone={isCritical ? "critical" : "elevated"}
          variant="companion"
        >
          {usageLabel} ·{" "}
          <Hoverable
            variant="highlight"
            onClick={() => setIsFairUsageModalOpened(true)}
          >
            <Trans>Fair Use policy</Trans>
          </Hoverable>
        </CreditUsageCard>
      </div>
    </>
  );
}
