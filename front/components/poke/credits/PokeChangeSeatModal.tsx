import { BillingPeriodSwitch } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  formatPriceCents,
  getAvailableFrequencies,
  groupSeatTypesByFrequency,
  includedSeatsOpen,
  SeatCard,
  sortSeatTypes,
} from "@app/components/workspace/SeatCard";
import { useSendNotification } from "@app/hooks/useNotification";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type {
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType, toBaseSeatType } from "@app/types/memberships";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  AlertCircle,
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

interface PokeChangeSeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  // Live seat-plan catalog for the workspace (see usePokeSeatPlan) — the
  // same source of truth the customer-facing ChangeSeatModal uses, so the
  // picker shows real seat cards, pricing, and included-seat counts.
  seatPlans: SeatPlanResponseBody;
  isSeatPlanLoading: boolean;
  isSeatPlanError: boolean;
}

// Poke has no working write route for member seat changes yet, so Validate
// is wired to nothing but a notice rather than an actual mutation — mirrors
// PokeMemberSpendLimitModal's Save behavior.
function useUnavailableSeatChangeSave() {
  const sendNotification = useSendNotification();
  return () =>
    sendNotification({
      title: "Not available from Poke yet",
      description: "Changing a member's seat from Poke isn't supported yet.",
      type: "info",
    });
}

// Mirrors ChangeSeatModal's getBadge: a "Current" chip for the member's own
// seat, otherwise the price plus how many already-committed seats are free
// to absorb this move before it starts a new billed seat.
function getBadge(
  seatType: MembershipSeatType,
  info: SeatTypeInfo,
  isCurrent: boolean
): React.ReactNode {
  if (isCurrent) {
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

export function PokeChangeSeatModal({
  isOpen,
  onClose,
  member,
  seatPlans,
  isSeatPlanLoading,
  isSeatPlanError,
}: PokeChangeSeatModalProps) {
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  useEffect(() => {
    if (member) {
      lastMemberRef.current = member;
    }
  }, [member]);
  const displayedMember = member ?? lastMemberRef.current;

  const notifySaveUnavailable = useUnavailableSeatChangeSave();

  const seatTypes = sortSeatTypes(
    Object.keys(seatPlans)
      .filter(isMembershipSeatType)
      .filter((s) => s !== "free")
      .filter((s) => {
        const frequency = seatPlans[s]?.billingFrequency;
        return frequency === "monthly" || frequency === "annual";
      })
  );
  const seatTypesByFrequency = groupSeatTypesByFrequency(seatTypes, seatPlans);
  const availableFrequencies = getAvailableFrequencies(seatTypesByFrequency);

  const displayedMemberId = displayedMember?.sId ?? null;
  const currentSeatType = displayedMember?.seatType ?? null;
  const currentFrequency =
    currentSeatType && seatPlans[currentSeatType]
      ? seatPlans[currentSeatType].billingFrequency
      : null;
  const initialFrequency =
    (currentFrequency && seatTypesByFrequency[currentFrequency].length > 0
      ? currentFrequency
      : availableFrequencies[0]) ?? "monthly";

  const [selectedSeat, setSelectedSeat] = useState<MembershipSeatType | null>(
    currentSeatType ?? seatTypes[0] ?? null
  );
  const [activeFrequency, setActiveFrequency] = useState(initialFrequency);

  // Reset the selection and active tab to the member's current seat each
  // time the dialog opens for a (possibly different) member.
  useEffect(() => {
    if (isOpen) {
      setSelectedSeat(currentSeatType ?? seatTypes[0] ?? null);
      setActiveFrequency(initialFrequency);
    }
  }, [isOpen, currentSeatType, seatTypes[0], initialFrequency]);

  const displayedFirstName =
    displayedMember?.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="font-sans">
        <DialogHeader>
          <DialogTitle>
            {displayedFirstName
              ? `Change seat for ${displayedFirstName}`
              : "Change seat"}
          </DialogTitle>
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
              <p>
                Could not load a seat-plan catalog for this workspace, or it
                isn&apos;t configured for seat-based billing.
              </p>
            </ContentMessage>
          ) : (
            <div className="flex flex-col gap-3">
              {availableFrequencies.length > 1 && (
                <div className="mb-1 self-start">
                  {/* Remount per member so the uncontrolled switch picks up
                      the member's current billing frequency as its default. */}
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
                    badge={getBadge(
                      seatType,
                      info,
                      seatType === currentSeatType
                    )}
                    onClick={() => setSelectedSeat(seatType)}
                  />
                );
              })}
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
            label: "Validate",
            variant: "highlight",
            disabled: !selectedSeat || isSeatPlanLoading || isSeatPlanError,
            onClick: notifySaveUnavailable,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
