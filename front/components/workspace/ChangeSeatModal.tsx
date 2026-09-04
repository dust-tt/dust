import { BillingPeriodSwitch } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  formatPriceCents,
  getAvailableFrequencies,
  getInvoiceImpactMessage,
  groupSeatTypesByFrequency,
  includedSeatsOpen,
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
import type { BulkSeatChangePreviewBody } from "@app/lib/swr/memberships";
import {
  useBulkSeatChangePreview,
  useUpdateMemberSeatType,
} from "@app/lib/swr/memberships";
import type { MembershipSeatType } from "@app/types/memberships";
import {
  isMembershipSeatType,
  isPaidSeatType,
  toBaseSeatType,
} from "@app/types/memberships";
import { isSubscriptionCancellationScheduled } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Avatar,
  Chip,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
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
  isSeatPlanLoading?: boolean;
  isSeatPlanError?: boolean;
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
  isSeatPlanLoading = false,
  isSeatPlanError = false,
  onSavingChange,
  onSaved,
}: ChangeSeatModalProps) {
  const { subscription } = useAuth();
  const router = useAppRouter();
  const useCheckoutPath = isFreePlan(subscription.plan.code);
  // A cancelled subscription already has its end date scheduled with
  // Metronome; scheduling a seat change on top of it can land past that end
  // date and get rejected. Block seat changes until the subscription is
  // reactivated or has fully ended.
  const isSubscriptionCancelled =
    isSubscriptionCancellationScheduled(subscription);
  // Keep the last non-null member so the dialog can render its content through
  // the exit animation after the parent has cleared `member`. Set in an
  // effect, not during render: React can replay or discard a render, so a
  // write during render could leak a member from an abandoned render into
  // the exit-animation snapshot.
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  useEffect(() => {
    if (member) {
      lastMemberRef.current = member;
    }
  }, [member]);
  const displayedMember = member ?? lastMemberRef.current;

  // "free" seats are not user-selectable — a member can never be switched to
  // a Free seat from this modal. Filter the API response so the option never
  // appears in the picker even if it's returned by the seat plans endpoint.
  // Also restrict to monthly/annual plans: BillingPeriodSwitch only offers
  // those two cadences, so a weekly/quarterly-only seat plan would either
  // show under the wrong tab label or leave a tab with no cards.
  const seatTypes = sortSeatTypes(
    Object.keys(seatPlans)
      .filter(isMembershipSeatType)
      .filter((s) => s !== "free")
      .filter((s) => {
        const frequency = seatPlans[s]?.billingFrequency;
        return frequency === "monthly" || frequency === "annual";
      })
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
  const { doFetchSeatChangePreview } = useBulkSeatChangePreview({
    workspaceId: owner.sId,
  });
  const [invoicePreview, setInvoicePreview] =
    useState<BulkSeatChangePreviewBody | null>(null);
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false);
  const initializedMemberIdRef = useRef<string | null>(null);

  const seatTypesByFrequency = groupSeatTypesByFrequency(seatTypes, seatPlans);

  const availableFrequencies = getAvailableFrequencies(seatTypesByFrequency);

  // Default the active tab to the frequency of the user's current seat — falls
  // back to the first frequency that has any seats to show. The effect below
  // resets the selection when a different member opens the modal.
  //
  // Only trust the current seat's own frequency if it's actually one of the
  // selectable buckets: a "free" member's billing frequency (e.g. "monthly")
  // may not match any *other* seat type's frequency, since "free" itself is
  // filtered out of `seatTypes`/`seatTypesByFrequency` above — trusting it
  // blindly could land on an empty bucket with nothing to render and no
  // Monthly/Yearly switch to escape it (that switch only shows when more than
  // one bucket is populated).
  const currentFrequency =
    currentSeatType && seatPlans[currentSeatType]
      ? seatPlans[currentSeatType].billingFrequency
      : null;
  const initialFrequency: SeatBillingFrequency =
    (currentFrequency && seatTypesByFrequency[currentFrequency].length > 0
      ? currentFrequency
      : availableFrequencies[0]) ?? "monthly";
  const [activeFrequency, setActiveFrequency] =
    useState<SeatBillingFrequency>(initialFrequency);

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
    setActiveFrequency(initialFrequency);
    initializedMemberIdRef.current = displayedMemberId;
    setIsSaving(false);
  }, [
    displayedMemberId,
    displayedMemberSeatType,
    firstSeatType,
    initialFrequency,
    isOpen,
  ]);

  // Fetch the accurate invoice impact of the selected change from the same
  // preview endpoint the bulk seat-change modal uses (proration, committed
  // seat absorption and next-billing-period timing all live server-side —
  // recomputing them from `seatPlans` alone risks staleness and drift from
  // the real billing logic).
  useEffect(() => {
    if (
      !isOpen ||
      !displayedMemberId ||
      !selectedSeat ||
      useCheckoutPath ||
      isSubscriptionCancelled ||
      selectedSeat === currentSeatType ||
      !isPaidSeatType(selectedSeat)
    ) {
      setInvoicePreview(null);
      setIsInvoicePreviewLoading(false);
      return;
    }

    let isStale = false;
    setIsInvoicePreviewLoading(true);
    void doFetchSeatChangePreview({
      selection: { mode: "ids", userIds: [displayedMemberId] },
      seatType: selectedSeat,
    }).then((result) => {
      if (isStale) {
        return;
      }
      setInvoicePreview(result);
      setIsInvoicePreviewLoading(false);
    });

    return () => {
      isStale = true;
    };
  }, [
    isOpen,
    displayedMemberId,
    selectedSeat,
    useCheckoutPath,
    isSubscriptionCancelled,
    currentSeatType,
    doFetchSeatChangePreview,
  ]);

  function getBadge(
    seatType: MembershipSeatType,
    info: SeatTypeInfo
  ): React.ReactNode {
    if (seatType === currentSeatType) {
      return <Chip size="xs" color="highlight" label="Current" />;
    }
    const price =
      info.billingFrequency === "annual" ? (
        <>
          {formatPriceCents(info.priceCents / 12, info.currency, "monthly")} ·
          billed annually
        </>
      ) : (
        formatPriceCents(info.priceCents, info.currency, info.billingFrequency)
      );
    // Workspace seats draw from the shared credit pool rather than the
    // plan's per-seat committed count, so the included-seats framing below
    // doesn't apply to them.
    if (toBaseSeatType(seatType) === "workspace") {
      return (
        <span className="text-xs text-foreground">
          {price} · User can spend credits from the workspace pool.
        </span>
      );
    }
    const openCount = includedSeatsOpen(info);
    return (
      <span className="text-xs text-foreground">
        {price} ·{" "}
        {openCount > 0
          ? `${openCount} included seat${pluralize(openCount)} open`
          : "No included seats left — this will add a new billed seat"}
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

  // Mirrors the backend `classifySeatChange` rule (lib/metronome/seats.ts):
  // a transition is deferred either when the target seat has strictly lower
  // AWU allocation than the current one — the user keeps the richer access
  // through the period they already paid for — or when it commits a monthly
  // paid seat to yearly billing, which never takes effect mid-period even
  // when the target tier is higher. Identical seats are never deferred
  // (they're a no-op).
  const currentAwuCredits = currentSeatType
    ? (seatPlans[currentSeatType]?.awuCredits ?? 0)
    : 0;
  const selectedAwuCredits = selectedSeat
    ? (seatPlans[selectedSeat]?.awuCredits ?? 0)
    : 0;
  const isMonthlyToYearlySwitch =
    !!currentSeatType &&
    !!selectedSeat &&
    isPaidSeatType(currentSeatType) &&
    !currentSeatType.endsWith("_yearly") &&
    selectedSeat.endsWith("_yearly");
  const isDeferredChange =
    !!selectedSeat &&
    selectedSeat !== currentSeatType &&
    (selectedAwuCredits < currentAwuCredits || isMonthlyToYearlySwitch);

  const displayedFirstName =
    displayedMember?.name?.trim().split(/\s+/)[0] ?? null;

  // A single member's move is classified as either immediate or deferred by
  // the backend, never both — summing is equivalent to picking whichever one
  // is non-zero.
  const invoiceDeltaCents =
    (invoicePreview?.immediateDeltaMonthlyCents ?? 0) +
    (invoicePreview?.deferredDeltaMonthlyCents ?? 0);

  const selectedSeatInfo = selectedSeat ? seatPlans[selectedSeat] : null;
  // Trust the backend's own classification of this specific move (which
  // bucket its delta landed in) over recomputing it client-side.
  const isInvoiceDeltaDeferred =
    (invoicePreview?.deferredDeltaMonthlyCents ?? 0) !== 0;

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
              <p className="text-sm text-muted-foreground">
                Choose a new plan to continue
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          {isSeatPlanLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : isSeatPlanError || seatTypes.length === 0 ? (
            <ContentMessage
              title="No seat plans available"
              icon={AlertCircle}
              variant="warning"
            >
              <p>We couldn&apos;t load the seat plans for this workspace.</p>
            </ContentMessage>
          ) : (
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

              {isSubscriptionCancelled ? (
                <p className="mt-1 text-xs text-warning-600">
                  Your subscription is scheduled to end and seats can&apos;t be
                  changed until it&apos;s reactivated.
                </p>
              ) : (
                isDeferredChange && (
                  <p className="mt-1 text-xs text-info-600">
                    The change will take effect at the next credit refresh.
                  </p>
                )
              )}
              {isCancellingScheduledChange && (
                <p className="mt-1 text-xs text-info-600">
                  Scheduled change to{" "}
                  <span className="capitalize">
                    {displayedMember?.scheduledSeatType}
                  </span>{" "}
                  will be cancelled.
                </p>
              )}
              {!isSubscriptionCancelled &&
                selectedSeat &&
                selectedSeat !== currentSeatType &&
                (isInvoicePreviewLoading ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estimating invoice impact…
                  </p>
                ) : (
                  invoicePreview && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {getInvoiceImpactMessage({
                        deltaCents: invoiceDeltaCents,
                        currency: invoicePreview.currency,
                        targetSeatInfo: selectedSeatInfo ?? null,
                        moveCount: 1,
                        isDeferred: isInvoiceDeltaDeferred,
                        hasAnnualOrigin: currentFrequency === "annual",
                      })}
                    </p>
                  )
                ))}
            </div>
          )}
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
            disabled:
              isSeatPlanLoading ||
              isSeatPlanError ||
              (useCheckoutPath
                ? !selectedSeat || !toCheckoutParams(selectedSeat)
                : isSaving ||
                  !selectedSeat ||
                  isSubscriptionCancelled ||
                  (selectedSeat === currentSeatType &&
                    !isCancellingScheduledChange)),
            onClick: handleValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
