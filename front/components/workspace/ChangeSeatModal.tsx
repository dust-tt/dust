import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type {
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { useUpdateMemberSeatType } from "@app/lib/swr/memberships";
import type { SupportedCurrency } from "@app/types/currency";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import type { MembershipSeatType } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SeatFreeIcon,
  SeatMaxIcon,
  SeatProIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

// Per-seat-type display icon. The label / name comes from the API
// (`SeatTypeInfo.name`) so adding a new seat tier only requires tagging the
// product in Metronome — no code change here.
const SEAT_TYPE_ICONS: Partial<
  Record<MembershipSeatType, React.ComponentType>
> = {
  free: SeatFreeIcon,
  pro: SeatProIcon,
  max: SeatMaxIcon,
};

// Display order when multiple seat tiers are returned by the endpoint. Seat
// types not in this list are appended in the order they came in.
const SEAT_DISPLAY_ORDER: MembershipSeatType[] = ["free", "pro", "max"];

function sortSeatTypes(seatTypes: MembershipSeatType[]): MembershipSeatType[] {
  const indexOf = (s: MembershipSeatType) => {
    const i = SEAT_DISPLAY_ORDER.indexOf(s);
    return i === -1 ? SEAT_DISPLAY_ORDER.length : i;
  };
  return [...seatTypes].sort((a, b) => indexOf(a) - indexOf(b));
}

function formatPriceCents(cents: number, currency: SupportedCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, "");
  return currency === "usd" ? `${symbol}${amount}/mo` : `${amount}${symbol}/mo`;
}

function formatAwuCredits(awuCredits: number): string {
  return `${awuCredits.toLocaleString("en-US")} credits/month`;
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
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={[
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        isSelected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
          : "border-border dark:border-border-night hover:border-blue-300 dark:hover:border-blue-700",
        isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      {Icon && <Icon />}
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          {info.name}
        </span>
        {info.awuCredits > 0 && (
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            {formatAwuCredits(info.awuCredits)}
          </span>
        )}
      </div>
      {badge}
    </button>
  );
}

interface ChangeSeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType;
  owner: WorkspaceType;
  seatPlans: SeatPlanResponseBody;
}

export function ChangeSeatModal({
  isOpen,
  onClose,
  member,
  owner,
  seatPlans,
}: ChangeSeatModalProps) {
  const seatTypes = sortSeatTypes(
    Object.keys(seatPlans) as MembershipSeatType[]
  );
  const currentSeatType: MembershipSeatType | null = member.seatType;
  const [selectedSeat, setSelectedSeat] = useState<MembershipSeatType | null>(
    currentSeatType ?? seatTypes[0] ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const { doUpdateSeatType } = useUpdateMemberSeatType({
    workspaceId: owner.sId,
  });

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
      <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
        {formatPriceCents(info.priceCents, info.currency)}
      </span>
    );
  }

  // Member has a scheduled seat change and is re-selecting their current seat to cancel it.
  const isCancellingScheduledChange =
    !!member.scheduledSeatType && selectedSeat === currentSeatType;

  async function handleValidate() {
    if (!selectedSeat) {
      return;
    }
    if (selectedSeat === currentSeatType && !isCancellingScheduledChange) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const ok = await doUpdateSeatType({
        memberId: member.sId,
        memberName: member.name,
        seatType: selectedSeat,
        isCancellingScheduledChange,
      });
      if (ok) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  // Max → Pro is deferred (downgrade waits for next billing period).
  const isDeferredChange = currentSeatType === "max" && selectedSeat === "pro";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar
              visual={member.image ?? undefined}
              name={member.name}
              size="md"
              isRounded
            />
            <div>
              <DialogTitle>Change Seat Type for {member.name}</DialogTitle>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                They will be able to consume this amount from the pool after
                reaching their plan usage limit.
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-2">
            <div className="mb-1 flex items-center gap-1">
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground dark:bg-muted-night dark:text-foreground-night">
                Monthly
              </span>
            </div>

            {seatTypes.map((seatType) => {
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
                <span className="capitalize">{member.scheduledSeatType}</span>{" "}
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
