import {
  getSeatBarClasses,
  getSeatIconColorClass,
} from "@app/components/workspace/seat_styles";
import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { formatNumber } from "@app/lib/i18n/format";
import { formatCurrencyAmountCents } from "@app/lib/metronome/amounts";
import { SEAT_PRODUCT_YEARLY_SUFFIX } from "@app/lib/metronome/constants";
import type { SupportedCurrency } from "@app/types/currency";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import type { MembershipSeatType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";

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

export function formatSeatAmountCents(
  cents: number,
  currency: SupportedCurrency
): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, "");
  // EUR is the only currency we render with a trailing symbol (e.g. "30€");
  // USD and GBP are prefix currencies ("$30", "£30").
  return currency === "eur" ? `${amount}${symbol}` : `${symbol}${amount}`;
}

export function formatPriceCents(
  cents: number,
  currency: SupportedCurrency,
  billingFrequency: SeatBillingFrequency,
  t: (descriptor: MessageDescriptor) => string
): string {
  const amount = formatSeatAmountCents(cents, currency);
  switch (billingFrequency) {
    case "weekly":
      return t(msg`${amount}/wk`);
    case "monthly":
      return t(msg`${amount}/mo`);
    case "quarterly":
      return t(msg`${amount}/qtr`);
    case "annual":
      return t(msg`${amount}/yr`);
    default:
      assertNeverAndIgnore(billingFrequency);
      return amount;
  }
}

// Seats already committed in the plan's billing floor (`minSeats`) that aren't
// currently assigned to a member — i.e. free to consume without an extra
// charge. Assigning past this count starts (or bumps the price of) a new
// billed seat.
export function includedSeatsOpen(info: SeatTypeInfo): number {
  return Math.max(0, info.minSeats - info.assignedCount);
}

function formatAwuCredits(
  info: SeatTypeInfo,
  t: (descriptor: MessageDescriptor) => string
): string {
  const credits = info.awuCredits;
  switch (info.awuCreditsPeriod) {
    case "weekly":
      return t(
        msg`${plural(credits, {
          one: "# credit per week",
          other: "# credits per week",
        })}`
      );
    case "monthly":
      return t(
        msg`${plural(credits, {
          one: "# credit per month",
          other: "# credits per month",
        })}`
      );
    case "quarterly":
      return t(
        msg`${plural(credits, {
          one: "# credit per quarter",
          other: "# credits per quarter",
        })}`
      );
    case "annual":
      return t(
        msg`${plural(credits, {
          one: "# credit per year",
          other: "# credits per year",
        })}`
      );
    case "lifetime":
      return t(
        msg`${plural(credits, {
          one: "# credit lifetime",
          other: "# credits lifetime",
        })}`
      );
    default:
      assertNeverAndIgnore(info.awuCreditsPeriod);
      return formatNumber(credits);
  }
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

interface InvoiceChangeStartingNextPeriodProps {
  amount: string;
  billingFrequency: SeatBillingFrequency;
}

function InvoiceAdditionStartingNextPeriod({
  amount,
  billingFrequency,
}: InvoiceChangeStartingNextPeriodProps) {
  switch (billingFrequency) {
    case "weekly":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/wk</span> to
          your invoice starting next weekly term.
        </Trans>
      );
    case "monthly":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/mo</span> to
          your invoice starting next monthly billing period.
        </Trans>
      );
    case "quarterly":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/qtr</span> to
          your invoice starting next quarterly term.
        </Trans>
      );
    case "annual":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/yr</span> to
          your invoice starting next annual term.
        </Trans>
      );
    default:
      assertNeverAndIgnore(billingFrequency);
      return null;
  }
}

function InvoiceRemovalStartingNextPeriod({
  amount,
  billingFrequency,
}: InvoiceChangeStartingNextPeriodProps) {
  switch (billingFrequency) {
    case "weekly":
      return (
        <Trans>
          This will remove an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/wk</span>{" "}
          from your invoice starting next weekly term.
        </Trans>
      );
    case "monthly":
      return (
        <Trans>
          This will remove an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/mo</span>{" "}
          from your invoice starting next monthly billing period.
        </Trans>
      );
    case "quarterly":
      return (
        <Trans>
          This will remove an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/qtr</span>{" "}
          from your invoice starting next quarterly term.
        </Trans>
      );
    case "annual":
      return (
        <Trans>
          This will remove an estimated{" "}
          <span className="font-semibold text-foreground">{amount}/yr</span>{" "}
          from your invoice starting next annual term.
        </Trans>
      );
    default:
      assertNeverAndIgnore(billingFrequency);
      return null;
  }
}

interface ProratedInvoiceAdditionProps {
  proratedPrice: string;
  daysRemaining: number;
  price: string;
  billingFrequency: SeatBillingFrequency;
}

function ProratedInvoiceAddition({
  proratedPrice,
  daysRemaining,
  price,
  billingFrequency,
}: ProratedInvoiceAdditionProps) {
  switch (billingFrequency) {
    case "weekly":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{proratedPrice}</span>
          , prorated for the{" "}
          <Plural value={daysRemaining} one="# day" other="# days" /> left in
          your current weekly term (full price: {price}/wk).
        </Trans>
      );
    case "monthly":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{proratedPrice}</span>
          , prorated for the{" "}
          <Plural value={daysRemaining} one="# day" other="# days" /> left in
          your current monthly billing period (full price: {price}/mo).
        </Trans>
      );
    case "quarterly":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{proratedPrice}</span>
          , prorated for the{" "}
          <Plural value={daysRemaining} one="# day" other="# days" /> left in
          your current quarterly term (full price: {price}/qtr).
        </Trans>
      );
    case "annual":
      return (
        <Trans>
          This will add an estimated{" "}
          <span className="font-semibold text-foreground">{proratedPrice}</span>
          , prorated for the{" "}
          <Plural value={daysRemaining} one="# day" other="# days" /> left in
          your current annual term (full price: {price}/yr).
        </Trans>
      );
    default:
      assertNeverAndIgnore(billingFrequency);
      return null;
  }
}

interface InvoiceAdditionUpToPeriodPriceProps {
  price: string;
  billingFrequency: SeatBillingFrequency;
}

function InvoiceAdditionUpToPeriodPrice({
  price,
  billingFrequency,
}: InvoiceAdditionUpToPeriodPriceProps) {
  switch (billingFrequency) {
    case "weekly":
      return (
        <Trans>
          This will add up to{" "}
          <span className="font-semibold text-foreground">{price}/wk</span>,
          prorated for the remainder of your current weekly term.
        </Trans>
      );
    case "monthly":
      return (
        <Trans>
          This will add up to{" "}
          <span className="font-semibold text-foreground">{price}/mo</span>,
          prorated for the remainder of your current monthly billing period.
        </Trans>
      );
    case "quarterly":
      return (
        <Trans>
          This will add up to{" "}
          <span className="font-semibold text-foreground">{price}/qtr</span>,
          prorated for the remainder of your current quarterly term.
        </Trans>
      );
    case "annual":
      return (
        <Trans>
          This will add up to{" "}
          <span className="font-semibold text-foreground">{price}/yr</span>,
          prorated for the remainder of your current annual term.
        </Trans>
      );
    default:
      assertNeverAndIgnore(billingFrequency);
      return null;
  }
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
  const price = formatCurrencyAmountCents({
    amountCents: priceCents,
    currency,
  });

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
    const extra = formatCurrencyAmountCents({
      amountCents: extraCents,
      currency,
    });
    return (
      <Trans>
        This will add an estimated{" "}
        <span className="font-semibold text-foreground">{extra}</span> to your
        next invoice — you&apos;ll be billed{" "}
        <span className="font-semibold text-foreground">{price}</span> upfront
        for the year starting next annual term.
      </Trans>
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
        return <Trans>This will not change your invoice.</Trans>;
      }
      return (
        <InvoiceAdditionStartingNextPeriod
          amount={price}
          billingFrequency={billingFrequency}
        />
      );
    }

    if (deltaCents === 0) {
      return <Trans>This will not change your invoice.</Trans>;
    }
    const deltaPeriodCents =
      Math.abs(deltaCents) * PERIOD_PRICE_MULTIPLIER[billingFrequency];
    const delta = formatCurrencyAmountCents({
      amountCents: deltaPeriodCents,
      currency,
    });
    return deltaCents > 0 ? (
      <InvoiceAdditionStartingNextPeriod
        amount={delta}
        billingFrequency={billingFrequency}
      />
    ) : (
      <InvoiceRemovalStartingNextPeriod
        amount={delta}
        billingFrequency={billingFrequency}
      />
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
    return <Trans>This will not change your invoice.</Trans>;
  }
  const proration = currentBillingPeriod
    ? prorateAmountForCurrentPeriod({
        amountCents: priceCents,
        currentBillingPeriod,
      })
    : null;
  if (proration) {
    const proratedPrice = formatCurrencyAmountCents({
      amountCents: proration.amountCents,
      currency,
    });
    return (
      <ProratedInvoiceAddition
        proratedPrice={proratedPrice}
        daysRemaining={proration.daysRemaining}
        price={price}
        billingFrequency={billingFrequency}
      />
    );
  }
  return (
    <InvoiceAdditionUpToPeriodPrice
      price={price}
      billingFrequency={billingFrequency}
    />
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
  // When set, the card can't be selected (e.g. the seat type is at its
  // `maxSeats` cap). Clicks are ignored and the card is visually muted.
  disabled?: boolean;
}

export function SeatCard({
  seatType,
  info,
  isSelected,
  badge,
  onClick,
  disabled = false,
}: SeatCardProps) {
  const { t } = useLingui();
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
      onClick={disabled ? undefined : onClick}
      className={cn(
        "w-full flex-col items-stretch gap-2 ring-0",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="flex w-full items-center gap-2">
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
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
          {stripYearlySuffix(info.name)}
        </span>
      </div>
      {/* On its own row rather than beside the name: the price/included-seats
          badge is often too long to share a row with the name at this card
          width without wrapping onto (and overlapping) the icon. */}
      <div>{badge}</div>
      {info.awuCredits > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon
            visual={CoinsStacked01}
            size="xs"
            className="text-muted-foreground"
          />
          <span className="text-xs">{formatAwuCredits(info, t)}</span>
        </div>
      )}
    </Card>
  );
}
