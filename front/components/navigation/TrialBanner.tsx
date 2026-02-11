import { Button, cn, LinkWrapper } from "@dust-tt/sparkle";
import { useMemo, useRef } from "react";

import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";
import type { SubscriptionType } from "@app/types/plan";

const SUBSCRIPTION_BANNER_DISPLAY_THRESHOLD_DAYS = 30;
const THRESHOLD_MS =
  SUBSCRIPTION_BANNER_DISPLAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SubscriptionEndBannerProps {
  isAdmin: boolean;
  owner: { sId: string };
  subscription: SubscriptionType;
}

export function SubscriptionEndBanner({
  isAdmin,
  owner,
  subscription,
}: SubscriptionEndBannerProps) {
  const endDate = subscription.endDate;
  const isTrial = isFreeTrialPhonePlan(subscription.plan.code);

  // Capture initial timestamp in a ref to avoid re-computation on re-renders.
  // This is intentionally not reactive - the banner state is stable for the session.
  // eslint-disable-next-line react-hooks/purity
  const nowRef = useRef(Date.now());

  const bannerState = useMemo(() => {
    if (!endDate) {
      return null;
    }

    const now = nowRef.current;

    if (endDate > now + THRESHOLD_MS) {
      return null;
    }

    const hasEnded = endDate < now;
    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / DAY_MS));

    return { hasEnded, daysRemaining };
  }, [endDate]);

  if (!bannerState) {
    return null;
  }

  const { hasEnded, daysRemaining } = bannerState;

  let title: string;
  if (isTrial) {
    title = hasEnded
      ? "Heads up, your trial has ended"
      : `Heads up, your trial ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
  } else {
    title = hasEnded
      ? "Heads up, your subscription has ended"
      : `Heads up, your subscription ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        "bg-sky-50 dark:bg-sky-50-night"
      )}
    >
      <div className="flex flex-col text-sm">
        <span
          className={cn(
            "font-semibold",
            "text-sky-900 dark:text-sky-900-night"
          )}
        >
          {title}
        </span>
        <span className="text-sky-800 dark:text-sky-800-night">
          When your {isTrial ? "trial" : "subscription"} wraps up, your
          connections and team member access will be removed. Subscribe now to
          keep everything.
        </span>
      </div>
      {isAdmin && (
        <LinkWrapper
          href={`/w/${owner.sId}/subscription`}
          className="shrink-0 no-underline"
        >
          <Button
            label="Subscribe to Dust"
            className={cn(
              "bg-sky-600 dark:bg-sky-600-night",
              "dark:text-white-night text-white",
              "hover:bg-sky-700 dark:hover:bg-sky-700-night"
            )}
            size="sm"
          />
        </LinkWrapper>
      )}
    </div>
  );
}
