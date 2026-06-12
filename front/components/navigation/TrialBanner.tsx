import {
  isEnterprisePlanPrefix,
  isFreeTrialPhonePlan,
} from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import type { SubscriptionType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import { Button, cn, LinkWrapper } from "@dust-tt/sparkle";
import { Link } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

const SUBSCRIPTION_BANNER_DISPLAY_THRESHOLD_DAYS = 30;
const THRESHOLD_MS =
  SUBSCRIPTION_BANNER_DISPLAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function isSubscriptionManagementRoute(path: string) {
  return (
    /^\/w\/[^/]+\/billing$/.test(path) ||
    /^\/w\/[^/]+\/subscription$/.test(path)
  );
}

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
  const router = useAppRouter();
  const endDate = subscription.endDate;
  const isTrial = isFreeTrialPhonePlan(subscription.plan.code);
  const isEnterprise = isEnterprisePlanPrefix(subscription.plan.code);
  const currentPath = router.pathname || router.asPath.split("?")[0];
  const ctaHref = isCreditPricedPlan(subscription.plan)
    ? `/w/${owner.sId}/billing`
    : `/w/${owner.sId}/subscription`;

  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = bannerRef.current;
    if (node) {
      document.documentElement.style.setProperty(
        "--banner-height",
        `${node.offsetHeight}px`
      );
    }

    return () => {
      document.documentElement.style.setProperty("--banner-height", "0px");
    };
  });

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

  if (isSubscriptionManagementRoute(currentPath)) {
    return null;
  }

  if (!bannerState) {
    return null;
  }

  const { hasEnded, daysRemaining } = bannerState;

  let title: string;
  let description: string;

  if (isTrial) {
    title = hasEnded
      ? "Heads up, your trial has ended"
      : `Heads up, your trial ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
    description =
      "When your trial wraps up, your connections and team member access will be removed. Subscribe now to keep everything.";
  } else if (isEnterprise) {
    title = hasEnded
      ? "Your current subscription period has ended"
      : `Your current subscription period ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
    description =
      "Please reach out to your account manager to ensure continuity.";
  } else {
    title = hasEnded
      ? "Heads up, your subscription has ended"
      : `Heads up, your subscription ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
    description =
      "When your subscription wraps up, your connections and team member access will be removed. Subscribe now to keep everything.";
  }

  return (
    <div
      ref={bannerRef}
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-1",
        "bg-sky-50 dark:bg-sky-50-night",
      )}
    >
      <div className="text-sm flex gap-2">
        <p
          className={cn(
            "font-semibold",
            "text-sky-900 dark:text-sky-900-night"
          )}
        >
          {title}
        </p>
        <p className="text-sky-800 dark:text-sky-800-night hidden md:inline-block">
          {description}
        </p>
      </div>
      {isAdmin && !isEnterprise && (
          <Button
            href={ctaHref}
            label={isTrial ? "Subscribe to Dust" : "Resume subscription"}
            className="hover:opacity-90 hover:bg-transparent"
            variant="ghost-secondary"
            size="sm"
          />
      )}
    </div>
  );
}
