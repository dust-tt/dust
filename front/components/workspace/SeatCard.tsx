import {
  getSeatBarClasses,
  getSeatIconColorClass,
} from "@app/components/workspace/seat_styles";
import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { formatCurrencyAmountCents } from "@app/lib/metronome/amounts";
import { SEAT_PRODUCT_YEARLY_SUFFIX } from "@app/lib/metronome/constants";
import type { SupportedCurrency } from "@app/types/currency";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import type { MembershipSeatType } from "@app/types/memberships";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  AlertCircle,
  Card,
  CoinsStacked01,
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
const SEAT_DISPLAY_ORDER: MembershipSeatType[] = [
  "free",
  "pro",
  "pro_yearly",
  "max",
  "max_yearly",
];

const SEAT_BILLING_FREQUENCIES: SeatBillingFrequency[] = [
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

// Shared across price formatting and invoice-impact messaging so both stay
// consistent when a new cadence is added.
const BILLING_FREQUENCY_SUFFIX: Record<SeatBillingFrequency, string> = {
  weekly: "/wk",
  monthly: "/mo",
  quarterly: "/qtr",
  annual: "/yr",
};

export function formatPriceCents(
  cents: number,
  currency: SupportedCurrency,
  billingFrequency: SeatBillingFrequency
): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, "");
  // EUR is the only currency we render with a trailing symbol (e.g. "30€");
  // USD and GBP are prefix currencies ("$30", "£30").
  return currency === "eur"
    ? `${amount}${symbol}${BILLING_FREQUENCY_SUFFIX[billingFrequency]}`
    : `${symbol}${amount}${BILLING_FREQUENCY_SUFFIX[billingFrequency]}`;
}

// Seats already committed in the plan's billing floor (`minSeats`) that aren't
// currently assigned to a member — i.e. free to consume without an extra
// charge. Assigning past this count starts (or bumps the price of) a new
// billed seat.
export function includedSeatsOpen(info: SeatTypeInfo): number {
  return Math.max(0, info.minSeats - info.assignedCount);
}

function formatAwuCredits(info: SeatTypeInfo): string {
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

// Preview endpoints return a monthly-equivalent figure for every cadence
// (e.g. annual price / 12), treating it as a steady-state run rate. Seats
// don't actually bill that way at any cadence: every seat subscription is
// created with `is_prorated: true` (`setup_common.ts`), so a change mid-term
// is billed as a prorated true-up for the rest of the CURRENT billing
// period, not the full period price. This inverts the monthly-equivalent
// normalization back to the seat's actual per-period price.
const PERIOD_PRICE_MULTIPLIER: Record<SeatBillingFrequency, number> = {
  weekly: 12 / 52,
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

// Human label for "your current X" in invoice-impact copy.
const BILLING_PERIOD_LABEL: Record<SeatBillingFrequency, string> = {
  weekly: "weekly term",
  monthly: "monthly billing period",
  quarterly: "quarterly term",
  annual: "annual term",
};

// Prorates a full-period amount for the days remaining in the current
// billing period, as of right now.
function prorateAmountForCurrentPeriod({
  amountCents,
  currentBillingPeriod,
}: {
  amountCents: number;
  currentBillingPeriod: { startsAt: string; endsAt: string };
}): { amountCents: number; daysRemaining: number } | null {
  const startMs = new Date(currentBillingPeriod.startsAt).getTime();
  const endMs = new Date(currentBillingPeriod.endsAt).getTime();
  const totalDays = (endMs - startMs) / ONE_DAY_MS;
  if (!(totalDays > 0)) {
    return null;
  }
  const daysRemaining = Math.min(
    totalDays,
    Math.max(0, (endMs - Date.now()) / ONE_DAY_MS)
  );
  return {
    amountCents: Math.round(amountCents * (daysRemaining / totalDays)),
    daysRemaining: Math.round(daysRemaining),
  };
}

// Renders the "this will add/remove $X" line shown under a seat picker or a
// seat-move summary, correctly scaled for the seat's billing cadence.
export function getInvoiceImpactMessage({
  deltaCents,
  currency,
  targetSeatInfo,
  moveCount,
  isDeferred,
  hasAnnualOrigin,
}: {
  // Steady-state monthly-equivalent delta between the old and new seat,
  // floor-aware (from the backend preview). Only meaningful for a deferred
  // move away from a non-annual seat: at that point the old subscription
  // simply stops and the new one starts fresh, so "your recurring bill
  // changes by $X going forward" is a valid, non-prorated comparison.
  deltaCents: number;
  currency: SupportedCurrency;
  // The target seat's own info (price, cadence, current billing period,
  // committed floor). Null when the seat plan hasn't loaded yet.
  targetSeatInfo: SeatTypeInfo | null;
  // How many members are moving onto this seat type in this move — used
  // only to check whether the workspace's already-committed (paid, unused)
  // seats absorb the whole move.
  moveCount: number;
  // Whether this change takes effect at the next credit refresh rather than
  // right away.
  isDeferred: boolean;
  // Whether (any of) the member(s) moving away are on an annual seat today.
  // An annual seat is an already-paid, non-refundable commitment — there is
  // no recurring old charge to net against once it's dropped, so a deferred
  // move off of one is never framed as a delta/removal, only as the new
  // seat's own charge starting fresh.
  hasAnnualOrigin: boolean;
}): React.ReactNode {
  if (!targetSeatInfo) {
    return null;
  }
  const { billingFrequency, priceCents, currentBillingPeriod } = targetSeatInfo;
  const periodSuffix = BILLING_FREQUENCY_SUFFIX[billingFrequency];
  const periodLabel = BILLING_PERIOD_LABEL[billingFrequency];

  // A deferred move onto an annual seat commits to a fresh annual term,
  // billed as a lump sum at the next credit refresh. This is never framed
  // as removing money — the member pays that lump sum outright, on top of
  // whatever they already paid for their current (shorter) period. Compare
  // against one month-equivalent of the new price (what a normal month
  // would have cost) so the number reflects the actual extra cash going out
  // now, not a steady-state comparison against the old seat that could look
  // tiny, or even net negative, while a large one-time charge is coming.
  if (isDeferred && billingFrequency === "annual") {
    const extraCents = Math.round((priceCents * 11) / 12);
    return (
      <>
        This will add an estimated{" "}
        <span className="font-semibold text-foreground">
          {formatCurrencyAmountCents({ amountCents: extraCents, currency })}
        </span>{" "}
        to your next invoice — you&apos;ll be billed{" "}
        <span className="font-semibold text-foreground">
          {formatCurrencyAmountCents({ amountCents: priceCents, currency })}
        </span>{" "}
        upfront for the year starting next annual term.
      </>
    );
  }

  // A deferred change takes effect at the start of a fresh billing period —
  // ordinarily the old subscription just stops and the new one starts
  // clean, so the steady-state delta (already floor-aware from the
  // backend) describes the change accurately, with nothing to prorate.
  if (isDeferred) {
    // ...unless the member is coming off an annual seat: that commitment
    // was already paid in full and isn't refunded, so there's no recurring
    // old charge to net against — only the new seat's own full price
    // applies, unconditionally, starting the next period.
    if (hasAnnualOrigin) {
      if (priceCents === 0) {
        return "This will not change your invoice.";
      }
      return (
        <>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">
            {formatCurrencyAmountCents({ amountCents: priceCents, currency })}
            {periodSuffix}
          </span>{" "}
          to your invoice starting next {periodLabel}.
        </>
      );
    }

    if (deltaCents === 0) {
      return "This will not change your invoice.";
    }
    const verb = deltaCents > 0 ? "add" : "remove";
    const deltaPeriodCents =
      Math.abs(deltaCents) * PERIOD_PRICE_MULTIPLIER[billingFrequency];
    return (
      <>
        This will {verb} an estimated{" "}
        <span className="font-semibold text-foreground">
          {formatCurrencyAmountCents({
            amountCents: deltaPeriodCents,
            currency,
          })}
          {periodSuffix}
        </span>{" "}
        {deltaCents > 0 ? "to" : "from"} your invoice starting next{" "}
        {periodLabel}.
      </>
    );
  }

  // Immediate change: a paid seat is never refunded/credited when removed,
  // so there's no "old seat" side to net against — the only real invoice
  // event is being charged for the new seat, prorated for the days left in
  // ITS OWN current period, unless the workspace's already-committed
  // (already-paid, unused) seats absorb the whole move.
  const chargeableCount = Math.max(
    0,
    moveCount - includedSeatsOpen(targetSeatInfo)
  );
  if (chargeableCount === 0) {
    return "This will not change your invoice.";
  }
  const fullPrice = (
    <>
      {formatCurrencyAmountCents({ amountCents: priceCents, currency })}
      {periodSuffix}
    </>
  );
  const proration = currentBillingPeriod
    ? prorateAmountForCurrentPeriod({
        amountCents: priceCents,
        currentBillingPeriod,
      })
    : null;
  if (proration) {
    return (
      <>
        This will add an estimated{" "}
        <span className="font-semibold text-foreground">
          {formatCurrencyAmountCents({
            amountCents: proration.amountCents,
            currency,
          })}
        </span>
        , prorated for the {proration.daysRemaining} day
        {pluralize(proration.daysRemaining)} left in your current {periodLabel}{" "}
        (full price: {fullPrice}).
      </>
    );
  }
  return (
    <>
      This will add up to{" "}
      <span className="font-semibold text-foreground">{fullPrice}</span>,
      prorated for the remainder of your current {periodLabel}.
    </>
  );
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
      : "bg-muted";

  return (
    <Card
      variant="primary"
      size="sm"
      selected={isSelected}
      onClick={onClick}
      className="w-full flex-col items-stretch gap-2 ring-0"
    >
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              iconBackgroundClass
            )}
          >
            <Icon
              visual={seatIcon}
              size="sm"
              className={getSeatIconColorClass(seatType)}
            />
          </div>
          <span className="truncate text-base font-semibold text-foreground">
            {stripYearlySuffix(info.name).replace(/\s+Seat$/, "")}
          </span>
        </div>
        <div className="shrink-0 tabular-nums">{badge}</div>
      </div>
      {info.awuCredits > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon
            visual={CoinsStacked01}
            size="xs"
            className="text-muted-foreground"
          />
          <span className="text-xs">{formatAwuCredits(info)}</span>
        </div>
      )}
    </Card>
  );
}
