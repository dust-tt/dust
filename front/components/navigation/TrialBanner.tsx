import { Button, cn } from "@dust-tt/sparkle";
import Link from "next/link";
import { useMemo, useRef } from "react";

import { isFreePlan } from "@app/lib/plans/plan_codes";
import type { SubscriptionType } from "@app/types";

const TRIAL_BANNER_DISPLAY_THRESHOLD_DAYS = 30;
const THRESHOLD_MS = TRIAL_BANNER_DISPLAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface TrialBannerProps {
  owner: { sId: string };
  subscription: SubscriptionType;
}

export function TrialBanner({ owner, subscription }: TrialBannerProps) {
  const endDate = subscription.endDate;

  // Capture initial timestamp in a ref to avoid re-computation on re-renders.
  // This is intentionally not reactive - the banner state is stable for the session.
  // eslint-disable-next-line react-hooks/purity
  const nowRef = useRef(Date.now());

  const bannerState = useMemo(() => {
    if (!endDate) {
      return null;
    }

    if (!isFreePlan(subscription.plan.code)) {
      return null;
    }

    const now = nowRef.current;

    if (endDate > now + THRESHOLD_MS) {
      return null;
    }

    const hasTrialEnded = endDate < now;
    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / DAY_MS));

    return { hasTrialEnded, daysRemaining };
  }, [endDate, subscription.plan.code]);

  if (!bannerState) {
    return null;
  }

  const { hasTrialEnded, daysRemaining } = bannerState;

  const title = hasTrialEnded
    ? "Heads up, your trial has ended"
    : `Heads up, your trial ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-2",
        "bg-sky-50 dark:bg-sky-950"
      )}
    >
      <div className="flex flex-col text-sm">
        <span className="font-semibold text-sky-900 dark:text-sky-100">
          {title}
        </span>
        <span className="text-sky-800 dark:text-sky-200">
          When your trial wraps up, your connections and team member access will
          be removed. Subscribe now to keep everything.
        </span>
      </div>
      <Link
        href={`/w/${owner.sId}/subscribe`}
        className="shrink-0 no-underline"
      >
        <Button label="Subscribe to Dust" variant="primary" size="sm" />
      </Link>
    </div>
  );
}
