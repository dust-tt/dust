import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { SEAT_PRODUCT_YEARLY_SUFFIX } from "@app/lib/metronome/constants";
import { useUpdateMemberSeatType } from "@app/lib/swr/memberships";
import type { SupportedCurrency } from "@app/types/currency";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import {
  isMembershipSeatType,
  type MembershipSeatType,
} from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Avatar,
  Button,
  ButtonGroup,
  Card,
  Chip,
  Cube01,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hexagon01,
  SeatMax,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

// Per-seat-type display icon. The label / name comes from the API
// (`SeatTypeInfo.name`) so adding a new seat tier only requires tagging the
// product in Metronome — no code change here.
const SEAT_TYPE_ICONS: Record<MembershipSeatType, React.ComponentType> = {
  none: AlertCircle,
  free: Hexagon01,
  pro: Cube01,
  pro_yearly: Cube01,
  max: SeatMax,
  max_yearly: SeatMax,
  workspace: Cube01,
  workspace_yearly: Cube01,
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

function sortSeatTypes(seatTypes: MembershipSeatType[]): MembershipSeatType[] {
  const indexOf = (s: MembershipSeatType) => {
    const i = SEAT_DISPLAY_ORDER.indexOf(s);
    return i === -1 ? SEAT_DISPLAY_ORDER.length : i;
  };
  return [...seatTypes].sort((a, b) => indexOf(a) - indexOf(b));
}

function formatPriceCents(
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

function formatFrequencyLabel(frequency: SeatBillingFrequency): string {
  if (frequency === "annual") {
    return "Yearly";
  }
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

// The Metronome product names append SEAT_PRODUCT_YEARLY_SUFFIX to the
// annual variant (e.g. "Pro Seat (Yearly)"). The billing cadence is conveyed
// by the tab selector, so the suffix is redundant in the seat card label.
function stripYearlySuffix(name: string): string {
  return name.endsWith(SEAT_PRODUCT_YEARLY_SUFFIX)
    ? name.slice(0, -SEAT_PRODUCT_YEARLY_SUFFIX.length)
    : name;
}

interface SeatCardProps {
  seatType: MembershipSeatType;
  info: SeatTypeInfo;
  isSelected: boolean;
  isDisabled: boolean;
  badge: React.ReactNode;
  onClick: () => void;
}

function SeatCard({
  seatType,
  info,
  isSelected,
  isDisabled,
  badge,
  onClick,
}: SeatCardProps) {
  const Icon = SEAT_TYPE_ICONS[seatType];

  return (
    <Card
      variant="primary"
      size="sm"
      selected={isSelected}
      onClick={isDisabled ? undefined : onClick}
      className="w-full flex-col items-stretch gap-2"
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon />}
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

interface ChangeSeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: WorkspaceType;
  seatPlans: SeatPlanResponseBody;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
}

export function ChangeSeatModal({
  isOpen,
  onClose,
  member,
  owner,
  seatPlans,
  onSavingChange,
}: ChangeSeatModalProps) {
  // Keep the last non-null member so the dialog can render its content through
  // the exit animation after the parent has cleared `member`.
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  if (member) {
    lastMemberRef.current = member;
  }
  const displayedMember = member ?? lastMemberRef.current;

  // "free" seats are not user-selectable — a member can never be switched to
  // a Free seat from this modal. Filter the API response so the option never
  // appears in the picker even if it's returned by the seat plans endpoint.
  const seatTypes = sortSeatTypes(
    Object.keys(seatPlans)
      .filter(isMembershipSeatType)
      .filter((s) => s !== "free")
  );
  const firstSeatType = seatTypes[0] ?? null;
  const displayedMemberId = displayedMember?.sId ?? null;
  const displayedMemberSeatType = displayedMember?.seatType ?? null;
  const currentSeatType: MembershipSeatType | null = displayedMemberSeatType;
  const [selectedSeat, setSelectedSeat] = useState<MembershipSeatType | null>(
    currentSeatType ?? seatTypes[0] ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const { doUpdateSeatType } = useUpdateMemberSeatType({
    workspaceId: owner.sId,
  });
  const initializedMemberIdRef = useRef<string | null>(null);

  const seatTypesByFrequency: Record<
    SeatBillingFrequency,
    MembershipSeatType[]
  > = {
    weekly: [],
    monthly: [],
    quarterly: [],
    annual: [],
  };
  for (const seatType of seatTypes) {
    const info = seatPlans[seatType];
    if (info) {
      seatTypesByFrequency[info.billingFrequency].push(seatType);
    }
  }

  const availableFrequencies = SEAT_BILLING_FREQUENCIES.filter(
    (f) => seatTypesByFrequency[f].length > 0
  );

  // Default the active tab to the frequency of the user's current seat — falls
  // back to the first frequency that has any seats to show. The effect below
  // resets the selection when a different member opens the modal.
  const currentFrequency =
    currentSeatType && seatPlans[currentSeatType]
      ? seatPlans[currentSeatType].billingFrequency
      : null;
  const [activeFrequency, setActiveFrequency] = useState<SeatBillingFrequency>(
    currentFrequency ?? availableFrequencies[0] ?? "monthly"
  );

  // Reset transient state when the dialog closes and initialize the selected
  // seat + active tab once per member open. Do not re-run on seat plan
  // refetches.
  useEffect(() => {
    if (!isOpen || !displayedMemberId) {
      initializedMemberIdRef.current = null;
      setIsSaving(false);
      return;
    }

    if (initializedMemberIdRef.current === displayedMemberId) {
      return;
    }

    const nextSelectedSeat = displayedMemberSeatType ?? firstSeatType;
    if (nextSelectedSeat === null) {
      return;
    }

    setSelectedSeat(nextSelectedSeat);
    if (currentFrequency) {
      setActiveFrequency(currentFrequency);
    } else if (availableFrequencies[0]) {
      setActiveFrequency(availableFrequencies[0]);
    }
    initializedMemberIdRef.current = displayedMemberId;
    setIsSaving(false);
  }, [
    availableFrequencies,
    currentFrequency,
    displayedMemberId,
    displayedMemberSeatType,
    firstSeatType,
    isOpen,
  ]);

  function getBadge(
    seatType: MembershipSeatType,
    info: SeatTypeInfo
  ): React.ReactNode {
    if (seatType === currentSeatType) {
      return (
        <span className="rounded-full border border-blue-400 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
          Current
        </span>
      );
    }
    return (
      <span className="text-xs text-foreground dark:text-foreground-night">
        {formatPriceCents(
          info.priceCents,
          info.currency,
          info.billingFrequency
        )}
      </span>
    );
  }

  // Compute the yearly discount as a percentage by comparing the yearly price
  // to monthly × 12 for the cheapest tier present in both frequencies. Falls
  // back to no chip when the data doesn't allow a meaningful comparison.
  function computeYearlyDiscountPercent(): number | null {
    const yearlyDiscounts: number[] = [];
    for (const yearlyKey of Object.keys(seatPlans)) {
      if (!yearlyKey.endsWith("_yearly")) {
        continue;
      }
      const monthlyKey = yearlyKey.slice(0, -"_yearly".length);
      const yearly = seatPlans[yearlyKey as MembershipSeatType];
      const monthly = seatPlans[monthlyKey as MembershipSeatType];
      if (!yearly || !monthly || monthly.priceCents <= 0) {
        continue;
      }
      const expectedYearly = monthly.priceCents * 12;
      if (yearly.priceCents >= expectedYearly) {
        continue;
      }
      yearlyDiscounts.push(1 - yearly.priceCents / expectedYearly);
    }
    if (yearlyDiscounts.length === 0) {
      return null;
    }
    // Use the max discount surfaced — matches "best savings" framing.
    const max = Math.max(...yearlyDiscounts);
    return Math.round(max * 100);
  }
  const yearlyDiscountPercent = computeYearlyDiscountPercent();

  // Member has a scheduled seat change and is re-selecting their current seat to cancel it.
  const isCancellingScheduledChange =
    !!displayedMember?.scheduledSeatType && selectedSeat === currentSeatType;

  async function handleValidate() {
    if (!selectedSeat || !displayedMember) {
      return;
    }
    if (selectedSeat === currentSeatType && !isCancellingScheduledChange) {
      onClose();
      return;
    }

    setIsSaving(true);
    onSavingChange?.(displayedMember.sId, true);
    try {
      const ok = await doUpdateSeatType({
        memberId: displayedMember.sId,
        memberName: displayedMember.name,
        seatType: selectedSeat,
        isCancellingScheduledChange,
        // The target seat is backed by a pool only when it carries an AWU
        // allocation in the seat plan.
        hasSeatPool: (seatPlans[selectedSeat]?.awuCredits ?? 0) > 0,
      });
      if (ok) {
        onClose();
      }
    } finally {
      setIsSaving(false);
      onSavingChange?.(displayedMember.sId, false);
    }
  }

  // Mirrors the backend `classifySeatTransition` rule
  // (lib/metronome/seat_types.ts): a transition is deferred when the target
  // seat has strictly lower AWU allocation than the current one — the user
  // keeps the richer access through the period they already paid for.
  // Identical seats are never deferred (they're a no-op).
  const currentAwuCredits = currentSeatType
    ? (seatPlans[currentSeatType]?.awuCredits ?? 0)
    : 0;
  const selectedAwuCredits = selectedSeat
    ? (seatPlans[selectedSeat]?.awuCredits ?? 0)
    : 0;
  const isDeferredChange =
    !!selectedSeat &&
    selectedSeat !== currentSeatType &&
    selectedAwuCredits < currentAwuCredits;

  const displayedFirstName =
    displayedMember?.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex flex-col gap-2">
            <Avatar
              visual={displayedMember?.image ?? undefined}
              name={displayedMember?.name}
              size="md"
              isRounded
            />
            <div className="flex flex-col gap-1">
              <DialogTitle>
                {displayedFirstName
                  ? `Change seat for ${displayedFirstName}`
                  : "Change seat"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Choose a new plan to continue
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-3">
            {availableFrequencies.length > 1 && (
              <div className="mb-1 flex items-center gap-2 self-start">
                <ButtonGroup>
                  {availableFrequencies.map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={activeFrequency === f ? "primary" : "outline"}
                      label={formatFrequencyLabel(f)}
                      onClick={() => setActiveFrequency(f)}
                    />
                  ))}
                </ButtonGroup>
                {yearlyDiscountPercent !== null && (
                  <Chip
                    size="xs"
                    color="green"
                    label={`-${yearlyDiscountPercent}%`}
                  />
                )}
              </div>
            )}

            {seatTypesByFrequency[activeFrequency].map((seatType) => {
              const info = seatPlans[seatType];
              if (!info) {
                return null;
              }
              return (
                <SeatCard
                  key={seatType}
                  seatType={seatType}
                  info={info}
                  isSelected={selectedSeat === seatType}
                  isDisabled={false}
                  badge={getBadge(seatType, info)}
                  onClick={() => setSelectedSeat(seatType)}
                />
              );
            })}

            {isDeferredChange && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                The change will take effect at the next credit refresh.
              </p>
            )}
            {isCancellingScheduledChange && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Scheduled change to{" "}
                <span className="capitalize">
                  {displayedMember?.scheduledSeatType}
                </span>{" "}
                will be cancelled.
              </p>
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Validate",
            variant: "primary",
            disabled:
              isSaving ||
              !selectedSeat ||
              (selectedSeat === currentSeatType &&
                !isCancellingScheduledChange),
            onClick: handleValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
