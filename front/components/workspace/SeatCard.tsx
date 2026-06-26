import {
  getSeatBarClasses,
  getSeatIconColorClass,
} from "@app/components/workspace/seat_styles";
import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { SEAT_PRODUCT_YEARLY_SUFFIX } from "@app/lib/metronome/constants";
import type { SupportedCurrency } from "@app/types/currency";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import type { MembershipSeatType } from "@app/types/memberships";
import {
  AlertCircle,
  Card,
  cn,
  Icon,
  LayerSingle,
  LayersThree01,
  LayersTwo01,
} from "@dust-tt/sparkle";

// Per-seat-type display icon, matching the plan-selection pages
// (SubscriptionPlans.tsx). The label / name comes from the API
// (`SeatTypeInfo.name`) so adding a new seat tier only requires tagging the
// product in Metronome — no code change here.
export const SEAT_TYPE_ICONS: Record<
  MembershipSeatType,
  React.ComponentType<{ className?: string }>
> = {
  none: AlertCircle,
  free: LayerSingle,
  pro: LayersTwo01,
  pro_yearly: LayersTwo01,
  max: LayersThree01,
  max_yearly: LayersThree01,
  workspace: LayersTwo01,
  workspace_yearly: LayersTwo01,
};

// Display order when multiple seat tiers are returned by the endpoint. Seat
// types not in this list are appended in the order they came in.
export const SEAT_DISPLAY_ORDER: MembershipSeatType[] = [
  "free",
  "pro",
  "pro_yearly",
  "max",
  "max_yearly",
];

export const SEAT_BILLING_FREQUENCIES: SeatBillingFrequency[] = [
  "weekly",
  "monthly",
  "quarterly",
  "annual",
];

export function sortSeatTypes(
  seatTypes: MembershipSeatType[]
): MembershipSeatType[] {
  const indexOf = (s: MembershipSeatType) => {
    const i = SEAT_DISPLAY_ORDER.indexOf(s);
    return i === -1 ? SEAT_DISPLAY_ORDER.length : i;
  };
  return seatTypes.toSorted((a, b) => indexOf(a) - indexOf(b));
}

// Group seat types by their billing frequency, preserving the input order
// within each bucket. Pair with `getAvailableFrequencies` to drive a
// Monthly/Yearly switch over the buckets that actually have seats.
export function groupSeatTypesByFrequency(
  seatTypes: MembershipSeatType[],
  seatPlans: SeatPlanResponseBody
): Record<SeatBillingFrequency, MembershipSeatType[]> {
  const byFrequency: Record<SeatBillingFrequency, MembershipSeatType[]> = {
    weekly: [],
    monthly: [],
    quarterly: [],
    annual: [],
  };
  for (const seatType of seatTypes) {
    const info = seatPlans[seatType];
    if (info) {
      byFrequency[info.billingFrequency].push(seatType);
    }
  }
  return byFrequency;
}

export function getAvailableFrequencies(
  byFrequency: Record<SeatBillingFrequency, MembershipSeatType[]>
): SeatBillingFrequency[] {
  return SEAT_BILLING_FREQUENCIES.filter((f) => byFrequency[f].length > 0);
}

export function formatPriceCents(
  cents: number,
  currency: SupportedCurrency,
  billingFrequency: SeatBillingFrequency
): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, "");
  const suffixByFrequency: Record<SeatBillingFrequency, string> = {
    weekly: "/wk",
    monthly: "/mo",
    quarterly: "/qtr",
    annual: "/yr",
  };
  return currency === "usd"
    ? `${symbol}${amount}${suffixByFrequency[billingFrequency]}`
    : `${amount}${symbol}${suffixByFrequency[billingFrequency]}`;
}

export function formatAwuCredits(info: SeatTypeInfo): string {
  const periodLabel: Record<SeatTypeInfo["awuCreditsPeriod"], string> = {
    weekly: "per week",
    monthly: "per month",
    quarterly: "per quarter",
    annual: "per year",
    lifetime: "lifetime",
  };
  return `${info.awuCredits.toLocaleString("en-US")} credits ${
    periodLabel[info.awuCreditsPeriod]
  }`;
}

// The Metronome product names append SEAT_PRODUCT_YEARLY_SUFFIX to the
// annual variant (e.g. "Pro Seat (Yearly)"). The billing cadence is conveyed
// by the tab selector, so the suffix is redundant in the seat card label.
export function stripYearlySuffix(name: string): string {
  return name.endsWith(SEAT_PRODUCT_YEARLY_SUFFIX)
    ? name.slice(0, -SEAT_PRODUCT_YEARLY_SUFFIX.length)
    : name;
}

interface SeatCardProps {
  seatType: MembershipSeatType;
  info: SeatTypeInfo;
  isSelected: boolean;
  badge: React.ReactNode;
  onClick: () => void;
}

export function SeatCard({
  seatType,
  info,
  isSelected,
  badge,
  onClick,
}: SeatCardProps) {
  const seatIcon = SEAT_TYPE_ICONS[seatType];
  // Same treatment as PlanCard (SubscriptionPlans.tsx): seat tiers without a
  // colored bar track map to the muted track, which matches the card
  // background, so use a contrasting neutral instead.
  const iconBackgroundClass =
    seatType.startsWith("pro") || seatType.startsWith("max")
      ? getSeatBarClasses(seatType).track
      : "bg-muted dark:bg-muted-night";

  return (
    <Card
      variant="primary"
      size="sm"
      selected={isSelected}
      onClick={onClick}
      className="w-full flex-col items-stretch gap-2"
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              iconBackgroundClass
            )}
          >
            <Icon
              visual={seatIcon}
              size="sm"
              className={getSeatIconColorClass(seatType)}
            />
          </div>
          <span className="text-base font-semibold text-foreground dark:text-foreground-night">
            {stripYearlySuffix(info.name)}
          </span>
        </div>
        {badge}
      </div>
      {info.awuCredits > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground dark:text-muted-foreground-night">
          <span className="text-xs">{formatAwuCredits(info)}</span>
        </div>
      )}
    </Card>
  );
}
