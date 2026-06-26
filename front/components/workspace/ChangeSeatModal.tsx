import { BillingPeriodSwitch } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  formatPriceCents,
  getAvailableFrequencies,
  groupSeatTypesByFrequency,
  SeatCard,
  sortSeatTypes,
} from "@app/components/workspace/SeatCard";
import type {
  CheckoutBillingPeriod,
  CheckoutSeatType,
} from "@app/lib/api/checkout/types";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { useAuth } from "@app/lib/auth/AuthContext";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useUpdateMemberSeatType } from "@app/lib/swr/memberships";
import {
  isMembershipSeatType,
  type MembershipSeatType,
} from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

function toCheckoutParams(
  seatType: MembershipSeatType
): { seatType: CheckoutSeatType; billingPeriod: CheckoutBillingPeriod } | null {
  switch (seatType) {
    case "pro":
      return { seatType: "pro", billingPeriod: "monthly" };
    case "pro_yearly":
      return { seatType: "pro", billingPeriod: "yearly" };
    case "max":
      return { seatType: "max", billingPeriod: "monthly" };
    case "max_yearly":
      return { seatType: "max", billingPeriod: "yearly" };
    case "workspace":
    case "workspace_yearly":
    case "none":
    case "free":
      return null;
    default:
      assertNeverAndIgnore(seatType);
      return null;
  }
}

interface ChangeSeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: WorkspaceType;
  seatPlans: SeatPlanResponseBody;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  // Fired once the seat change has been persisted successfully (not on cancel
  // or a no-op close). Used to resolve a linked upgrade request as approved.
  onSaved?: () => void;
}

export function ChangeSeatModal({
  isOpen,
  onClose,
  member,
  owner,
  seatPlans,
  onSavingChange,
  onSaved,
}: ChangeSeatModalProps) {
  const { subscription } = useAuth();
  const router = useAppRouter();
  const useCheckoutPath = isFreePlan(subscription.plan.code);
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

  const seatTypesByFrequency = groupSeatTypesByFrequency(seatTypes, seatPlans);

  const availableFrequencies = getAvailableFrequencies(seatTypesByFrequency);

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

  // Member has a scheduled seat change and is re-selecting their current seat to cancel it.
  const isCancellingScheduledChange =
    !!displayedMember?.scheduledSeatType && selectedSeat === currentSeatType;

  async function handleValidate() {
    if (!selectedSeat || !displayedMember) {
      return;
    }

    if (useCheckoutPath) {
      const params = toCheckoutParams(selectedSeat);
      if (params) {
        const query = new URLSearchParams({
          ...params,
          targetUserId: displayedMember.sId,
        });
        void router.push(
          `/w/${owner.sId}/subscription/checkout?${query.toString()}`
        );
      }
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
        onSaved?.();
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
              <div className="mb-1 self-start">
                {/* Remount per member so the uncontrolled switch picks up the
                    member's current billing frequency as its default. */}
                <BillingPeriodSwitch
                  key={displayedMemberId ?? "none"}
                  defaultValue={
                    currentFrequency === "annual" ? "yearly" : "monthly"
                  }
                  onValueChange={(period) =>
                    setActiveFrequency(
                      period === "yearly" ? "annual" : "monthly"
                    )
                  }
                />
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
            label: useCheckoutPath ? "Continue to checkout" : "Validate",
            variant: "primary",
            disabled: useCheckoutPath
              ? !selectedSeat || !toCheckoutParams(selectedSeat)
              : isSaving ||
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
