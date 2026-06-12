import {
  getSeatBarClasses,
  getSeatIconColorClass,
} from "@app/components/workspace/seat_styles";
import {
  CP_FREE_PLAN_CREDITS,
  CP_MAX_SEAT_COST_MONTHLY,
  CP_MAX_SEAT_COST_YEARLY,
  CP_PRO_SEAT_COST_MONTHLY,
  CP_PRO_SEAT_COST_YEARLY,
} from "@app/lib/client/subscription";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { MembershipSeatType } from "@app/types/memberships";
import type { BillingPeriod } from "@app/types/plan";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Check,
  Chip,
  cn,
  Icon,
  LayerSingle,
  LayersThree01,
  LayersTwo01,
} from "@dust-tt/sparkle";
import type React from "react";

// Shared building blocks for the plan-selection pages (SelectSubscriptionPage
// and the credit-priced SubscribePage). Page-specific chrome (titles, headers,
// admin/loading logic) lives in each page.

export type PaidPlanTier = "pro" | "max";

interface PlanCardProps {
  icon: React.ComponentType<{ className?: string }>;
  seatType: Extract<MembershipSeatType, "free" | "pro" | "max">;
  name: string;
  credits: string;
  creditsLabel: string;
  priceLabel: string;
  features: string[];
  action: React.ReactNode;
  footnote?: string;
}

export function PlanCard({
  icon,
  seatType,
  name,
  credits,
  creditsLabel,
  priceLabel,
  features,
  action,
  footnote,
}: PlanCardProps) {
  // The "free" seat maps to the muted bar track, which matches the card
  // background (invisible in dark mode), so use a contrasting neutral instead.
  const iconBackgroundClass =
    seatType === "free"
      ? "bg-muted dark:bg-muted-night"
      : getSeatBarClasses(seatType).track;
  const iconColorClass = getSeatIconColorClass(seatType);

  return (
    <div className="flex w-full flex-col rounded-2xl border border-border bg-background p-6 dark:border-border-night dark:bg-muted-background-night">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            iconBackgroundClass
          )}
        >
          <Icon visual={icon} size="sm" className={iconColorClass} />
        </div>
        <span className="text-lg font-semibold text-foreground dark:text-foreground-night">
          {name}
        </span>
      </div>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-4xl font-bold text-foreground dark:text-foreground-night">
          {credits}
        </span>
        <span className="whitespace-nowrap text-sm text-muted-foreground dark:text-muted-foreground-night">
          {creditsLabel}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
        {priceLabel}
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Icon
              visual={Check}
              size="sm"
              className="mt-0.5 text-primary-500"
            />
            <span className="text-sm text-foreground dark:text-foreground-night">
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-2 pt-12">
        {action}
        {footnote && (
          <p className="text-center text-xs text-muted-foreground dark:text-muted-foreground-night">
            {footnote}
          </p>
        )}
      </div>
    </div>
  );
}

interface BillingPeriodSwitchProps {
  defaultValue?: BillingPeriod;
  onValueChange: (period: BillingPeriod) => void;
}

export function BillingPeriodSwitch({
  defaultValue = "monthly",
  onValueChange,
}: BillingPeriodSwitchProps) {
  return (
    <ButtonsSwitchList
      defaultValue={defaultValue}
      onValueChange={(value) =>
        onValueChange(value === "yearly" ? "yearly" : "monthly")
      }
    >
      <ButtonsSwitch value="monthly" label="Monthly" />
      <div className="flex items-center gap-1.5">
        <ButtonsSwitch value="yearly" label="Yearly" />
        <Chip size="xs" color="blue" label="Save 20%" />
      </div>
    </ButtonsSwitchList>
  );
}

interface FreePlanCardProps {
  onStartFree: () => void;
}

export function FreePlanCard({ onStartFree }: FreePlanCardProps) {
  return (
    <PlanCard
      icon={LayerSingle}
      seatType="free"
      name="Free"
      credits={CP_FREE_PLAN_CREDITS.toLocaleString()}
      creditsLabel="credits"
      priceLabel="One-time · never expires"
      features={["Credits never reset", "Full access to every Dust feature"]}
      footnote="One-time phone verification required"
      action={
        <Button
          className="w-full"
          variant="outline"
          label="Start Free"
          onClick={withTracking(TRACKING_AREAS.AUTH, "cp_free_start", () => {
            onStartFree();
          })}
        />
      }
    />
  );
}

interface PaidPlanCardsProps {
  billingPeriod: BillingPeriod;
  onSubscribe: (seatType: PaidPlanTier) => void;
}

export function PaidPlanCards({
  billingPeriod,
  onSubscribe,
}: PaidPlanCardsProps) {
  const isYearly = billingPeriod === "yearly";
  const period = isYearly ? "yearly" : "monthly";
  const proSeatCostDollars = isYearly
    ? CP_PRO_SEAT_COST_YEARLY
    : CP_PRO_SEAT_COST_MONTHLY;
  const maxSeatCostDollars = isYearly
    ? CP_MAX_SEAT_COST_YEARLY
    : CP_MAX_SEAT_COST_MONTHLY;

  // The cards are returned without a layout/grouping container so each page
  // can decide its own wrapper (e.g. the subtle grouped wrapper only used
  // alongside the Free plan on SelectSubscriptionPage).
  return (
    <>
      <PlanCard
        icon={LayersTwo01}
        seatType="pro"
        name="Pro"
        credits="8,000"
        creditsLabel="credits/mo"
        priceLabel={`$${proSeatCostDollars}/seat/mo · billed ${period}`}
        features={["Refills every month", "Full access to every Dust feature"]}
        action={
          <Button
            className="w-full"
            variant="highlight"
            label="Subscribe to Pro"
            onClick={withTracking(
              TRACKING_AREAS.AUTH,
              "cp_subscription_start",
              () => {
                onSubscribe("pro");
              },
              { seat_type: "pro", billing_period: billingPeriod }
            )}
          />
        }
      />
      <PlanCard
        icon={LayersThree01}
        seatType="max"
        name="Max"
        credits="40,000"
        creditsLabel="credits/mo"
        priceLabel={`$${maxSeatCostDollars}/seat/mo · billed ${period}`}
        features={["Refills every month", "Full access to every Dust feature"]}
        action={
          <Button
            className="w-full"
            variant="outline"
            label="Subscribe to Max"
            onClick={withTracking(
              TRACKING_AREAS.AUTH,
              "cp_subscription_start",
              () => {
                onSubscribe("max");
              },
              { seat_type: "max", billing_period: billingPeriod }
            )}
          />
        }
      />
    </>
  );
}
