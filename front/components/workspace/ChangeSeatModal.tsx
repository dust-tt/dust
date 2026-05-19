import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { SeatTypeInfo } from "@app/lib/api/credits/seat_plan";
import { useUpdateMemberSeatType } from "@app/lib/swr/memberships";
import type { SupportedCurrency } from "@app/types/currency";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SeatMaxIcon,
  SeatProIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

const SEAT_DISPLAY_CONFIG = {
  pro: { label: "Pro plan", icon: SeatProIcon },
  max: { label: "Max plan", icon: SeatMaxIcon },
} as const;

type VisibleSeatType = keyof typeof SEAT_DISPLAY_CONFIG;

const VISIBLE_SEAT_ORDER: VisibleSeatType[] = ["pro", "max"];

function formatPriceCents(cents: number, currency: SupportedCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, "");
  return currency === "usd" ? `${symbol}${amount}/mo` : `${amount}${symbol}/mo`;
}

function formatAwuCredits(awuCredits: number): string {
  return `${awuCredits.toLocaleString("en-US")} credits/month`;
}

interface SeatCardProps {
  seatType: VisibleSeatType;
  isSelected: boolean;
  isDisabled: boolean;
  badge: React.ReactNode;
  creditsLabel: string | null;
  onClick: () => void;
}

function SeatCard({
  seatType,
  isSelected,
  isDisabled,
  badge,
  creditsLabel,
  onClick,
}: SeatCardProps) {
  const { label, icon: Icon } = SEAT_DISPLAY_CONFIG[seatType];

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
      <Icon />
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          {label}
        </span>
        {creditsLabel && (
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            {creditsLabel}
          </span>
        )}
      </div>
      {badge}
    </button>
  );
}

interface StockedSeatCounts {
  pro: number;
  max: number;
}

interface ChangeSeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType;
  owner: WorkspaceType;
  stockedSeatCounts?: StockedSeatCounts;
  proSeatInfo: SeatTypeInfo | null;
  maxSeatInfo: SeatTypeInfo | null;
}

function toVisibleSeatType(
  seatType: MemberUsageType["seatType"]
): VisibleSeatType | null {
  if (seatType === "max") {
    return "max";
  }
  if (seatType === "pro") {
    return "pro";
  }
  return null;
}

export function ChangeSeatModal({
  isOpen,
  onClose,
  member,
  owner,
  stockedSeatCounts = { pro: 0, max: 0 },
  proSeatInfo,
  maxSeatInfo,
}: ChangeSeatModalProps) {
  const currentSeatType = toVisibleSeatType(member.seatType);
  const [selectedSeat, setSelectedSeat] = useState<VisibleSeatType>(
    currentSeatType ?? "pro"
  );
  const [isSaving, setIsSaving] = useState(false);
  const { doUpdateSeatType } = useUpdateMemberSeatType({
    workspaceId: owner.sId,
  });

  const hasStockedSeats =
    stockedSeatCounts.pro > 0 || stockedSeatCounts.max > 0;

  function getBadge(seatType: VisibleSeatType): React.ReactNode {
    if (seatType === currentSeatType) {
      return (
        <span className="rounded-full border border-blue-400 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
          Current
        </span>
      );
    }
    const stockedCount =
      seatType === "pro" ? stockedSeatCounts.pro : stockedSeatCounts.max;
    if (stockedCount > 0) {
      return (
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground dark:border-border-night dark:text-foreground-night">
          {stockedCount} available
        </span>
      );
    }
    const info = seatType === "pro" ? proSeatInfo : maxSeatInfo;
    if (!info) {
      return null;
    }
    return (
      <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
        {formatPriceCents(info.priceCents, info.currency)}
      </span>
    );
  }

  function getCreditsLabel(seatType: VisibleSeatType): string | null {
    const info = seatType === "pro" ? proSeatInfo : maxSeatInfo;
    return info ? formatAwuCredits(info.awuCredits) : null;
  }

  // Member has a scheduled seat change and is re-selecting their current seat to cancel it.
  const isCancellingScheduledChange =
    !!member.scheduledSeatType && selectedSeat === currentSeatType;

  async function handleValidate() {
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

  // Max→Pro is deferred; show a note when that's the selection.
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
            {!hasStockedSeats && (
              <div className="mb-1 flex items-center gap-1">
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground dark:bg-muted-night dark:text-foreground-night">
                  Monthly
                </span>
              </div>
            )}

            {VISIBLE_SEAT_ORDER.map((seatType) => (
              <SeatCard
                key={seatType}
                seatType={seatType}
                isSelected={selectedSeat === seatType}
                isDisabled={false}
                badge={getBadge(seatType)}
                creditsLabel={getCreditsLabel(seatType)}
                onClick={() => setSelectedSeat(seatType)}
              />
            ))}

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
              (selectedSeat === currentSeatType &&
                !isCancellingScheduledChange),
            onClick: handleValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
