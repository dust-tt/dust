import { BillingPeriodSwitch } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  formatPriceCents,
  getAvailableFrequencies,
  groupSeatTypesByFrequency,
  SEAT_TYPE_ICONS,
  SeatCard,
  sortSeatTypes,
  stripYearlySuffix,
} from "@app/components/workspace/SeatCard";
import { getSeatIconColorClass } from "@app/components/workspace/seat_styles";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { formatCurrencyAmountCents } from "@app/lib/metronome/amounts";
import type { BulkSeatChangePreviewBody } from "@app/lib/swr/memberships";
import type { MembershipSeatType, PaidSeatType } from "@app/types/memberships";
import { isMembershipSeatType, isPaidSeatType } from "@app/types/memberships";
import {
  ArrowRight,
  Avatar,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@dust-tt/sparkle";
import { Fragment, useState } from "react";

const MAX_HEADER_AVATARS = 3;

interface BulkChangeSeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberCount: number;
  // Selected members visible on the current page, for the header avatar row.
  // With an "all across pages" selection this is only the visible subset.
  selectedMembers: MemberUsageType[];
  seatPlans: SeatPlanResponseBody;
  onFetchPreview: (
    seatType: PaidSeatType
  ) => Promise<BulkSeatChangePreviewBody | null>;
  onValidate: (args: {
    seatType: PaidSeatType;
    seatName: string;
    hasDeferredChanges: boolean;
  }) => Promise<boolean>;
}

export function BulkChangeSeatModal({
  isOpen,
  onClose,
  memberCount,
  selectedMembers,
  seatPlans,
  onFetchPreview,
  onValidate,
}: BulkChangeSeatModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* Without this, the dialog auto-focuses its first focusable element —
          the Avatar.Stack tooltip trigger — which opens the members tooltip
          as soon as the dialog appears. */}
      <DialogContent size="md" onOpenAutoFocus={(e) => e.preventDefault()}>
        {isOpen && (
          <BulkChangeSeatForm
            onClose={onClose}
            memberCount={memberCount}
            selectedMembers={selectedMembers}
            seatPlans={seatPlans}
            onFetchPreview={onFetchPreview}
            onValidate={onValidate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface BulkChangeSeatFormProps {
  onClose: () => void;
  memberCount: number;
  selectedMembers: MemberUsageType[];
  seatPlans: SeatPlanResponseBody;
  onFetchPreview: (
    seatType: PaidSeatType
  ) => Promise<BulkSeatChangePreviewBody | null>;
  onValidate: (args: {
    seatType: PaidSeatType;
    seatName: string;
    hasDeferredChanges: boolean;
  }) => Promise<boolean>;
}

const FREQUENCY_LABELS: Record<SeatBillingFrequency, string> = {
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "yearly",
};

// Compact seat label for the move rows: base tier name without the "Seat" /
// yearly suffixes, plus the billing cadence for paid seats — e.g.
// "Pro (monthly)", "Max (yearly)", "Free", "No seat".
function seatMoveLabel(
  seatType: MembershipSeatType,
  name: string | null,
  seatPlans: SeatPlanResponseBody
): string {
  if (seatType === "none") {
    return "No seat";
  }
  const baseName = stripYearlySuffix(name ?? seatType).replace(/\s+Seat$/, "");
  if (!isPaidSeatType(seatType)) {
    return baseName;
  }
  const frequency = seatPlans[seatType]?.billingFrequency;
  return frequency ? `${baseName} (${FREQUENCY_LABELS[frequency]})` : baseName;
}

interface SeatMoveSectionProps {
  title: string;
  moves: BulkSeatChangePreviewBody["moves"];
  deltaMonthlyCents: number;
  preview: BulkSeatChangePreviewBody;
  seatPlans: SeatPlanResponseBody;
}

// One section of the confirmation step (immediate changes vs next billing
// period): the move rows share a single grid so the arrows line up across
// rows, followed by the section's invoice impact.
function SeatMoveSection({
  title,
  moves,
  deltaMonthlyCents,
  preview,
  seatPlans,
}: SeatMoveSectionProps) {
  const { targetSeatType, targetSeatName } = preview;
  const targetLabel = seatMoveLabel(targetSeatType, targetSeatName, seatPlans);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="grid grid-cols-[max-content_max-content_max-content_1fr] items-center gap-x-2 gap-y-1.5 text-sm text-foreground">
        {moves.map((move) => (
          <Fragment key={move.fromSeatType}>
            <div className="flex items-center gap-1.5">
              <Icon
                visual={SEAT_TYPE_ICONS[move.fromSeatType]}
                size="sm"
                className={getSeatIconColorClass(move.fromSeatType)}
              />
              <span>
                {seatMoveLabel(move.fromSeatType, move.fromSeatName, seatPlans)}
              </span>
            </div>
            <Icon
              visual={ArrowRight}
              size="xs"
              className="text-muted-foreground"
            />
            <div className="flex items-center gap-1.5">
              <Icon
                visual={SEAT_TYPE_ICONS[targetSeatType]}
                size="sm"
                className={getSeatIconColorClass(targetSeatType)}
              />
              <span>{targetLabel}</span>
            </div>
            <span className="justify-self-end font-medium text-muted-foreground">
              ×{move.count.toLocaleString("en-US")}
            </span>
          </Fragment>
        ))}
      </div>
      {deltaMonthlyCents !== 0 ? (
        <p className="text-sm text-muted-foreground">
          This will {deltaMonthlyCents > 0 ? "add" : "remove"} an estimated{" "}
          <span className="font-semibold text-foreground">
            {formatCurrencyAmountCents({
              amountCents: Math.abs(deltaMonthlyCents),
              currency: preview.currency,
            })}
          </span>{" "}
          {deltaMonthlyCents > 0 ? "to" : "from"} your monthly invoice.
        </p>
      ) : (
        // Every move in the section is absorbed by committed (already paid)
        // seats.
        <p className="text-sm text-muted-foreground">
          This will not change your invoice.
        </p>
      )}
    </div>
  );
}

interface SeatSummarySectionProps {
  seatTotals: NonNullable<BulkSeatChangePreviewBody["seatTotals"]>;
  seatPlans: SeatPlanResponseBody;
}

// Per-seat-type recap table: committed pool size, assigned count today, and
// assigned count once every move has landed.
function SeatSummarySection({
  seatTotals,
  seatPlans,
}: SeatSummarySectionProps) {
  const headerClasses =
    "justify-self-end text-xs font-medium text-muted-foreground";
  const valueClasses = "justify-self-end font-medium text-muted-foreground";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">Summary</p>
      <div className="grid grid-cols-[1fr_max-content_max-content_max-content] items-center gap-x-4 gap-y-1.5 text-sm text-foreground">
        <span className="text-xs font-medium text-muted-foreground">
          Seat type
        </span>
        <span className={headerClasses}>Committed</span>
        <span className={headerClasses}>Before</span>
        <span className={headerClasses}>After</span>
        {seatTotals.map((total) => (
          <Fragment key={total.seatType}>
            <div className="flex items-center gap-1.5">
              <Icon
                visual={SEAT_TYPE_ICONS[total.seatType]}
                size="sm"
                className={getSeatIconColorClass(total.seatType)}
              />
              <span>
                {seatMoveLabel(total.seatType, total.seatName, seatPlans)}
              </span>
            </div>
            <span className={valueClasses}>
              {total.committedSeats > 0
                ? total.committedSeats.toLocaleString("en-US")
                : "—"}
            </span>
            <span className={valueClasses}>
              {total.assignedBefore.toLocaleString("en-US")}
            </span>
            <span className="justify-self-end font-medium text-foreground">
              {total.assignedAfter.toLocaleString("en-US")}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function formatBillingPeriodDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Price badge of a seat card in the pick step; annual seats show the
// monthly-equivalent price.
function getBadge(info: SeatTypeInfo): React.ReactNode {
  return (
    <span className="text-xs text-foreground">
      {info.billingFrequency === "annual" ? (
        <>
          {formatPriceCents(info.priceCents / 12, info.currency, "monthly")} ·
          billed annually
        </>
      ) : (
        formatPriceCents(info.priceCents, info.currency, info.billingFrequency)
      )}
    </span>
  );
}

interface BulkChangeSeatModalHeaderProps {
  // Selected members visible on the current page, for the avatar row.
  selectedMembers: MemberUsageType[];
  memberCount: number;
  step: BulkChangeSeatStep;
}

function BulkChangeSeatModalHeader({
  selectedMembers,
  memberCount,
  step,
}: BulkChangeSeatModalHeaderProps) {
  return (
    <DialogHeader>
      <div className="flex flex-col gap-2">
        {selectedMembers.length > 0 && (
          <div className="flex flex-row items-center gap-2">
            <Avatar.Stack
              avatars={selectedMembers
                .slice(0, MAX_HEADER_AVATARS)
                .map((member) => ({
                  name: member.name,
                  visual: member.image ?? undefined,
                  isRounded: true,
                }))}
              nbVisibleItems={MAX_HEADER_AVATARS}
              size="md"
            />
            {memberCount > MAX_HEADER_AVATARS && (
              <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-highlight-100 px-2 text-sm font-medium text-highlight-600">
                {memberCount}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <DialogTitle>
            Change seat for {memberCount.toLocaleString("en-US")} members
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {step === "pick"
              ? "Choose a new seat to continue"
              : "Review the changes before applying"}
          </p>
        </div>
      </div>
    </DialogHeader>
  );
}

interface BulkChangeSeatModalPickSeatDialogContentProps {
  seatPlans: SeatPlanResponseBody;
  selectedSeat: PaidSeatType | null;
  onSelectSeat: (seatType: PaidSeatType) => void;
}

// Pick step: the per-frequency seat cards with the monthly/yearly switch.
function BulkChangeSeatModalPickSeatDialogContent({
  seatPlans,
  selectedSeat,
  onSelectSeat,
}: BulkChangeSeatModalPickSeatDialogContentProps) {
  // "free" seats are one-shot starter seats and can never be assigned from
  // this modal; "none" (seat removal) has its own dedicated action.
  const seatTypes = sortSeatTypes(
    Object.keys(seatPlans).filter(isMembershipSeatType)
  ).filter(isPaidSeatType);

  const seatTypesByFrequency = groupSeatTypesByFrequency(seatTypes, seatPlans);
  const availableFrequencies = getAvailableFrequencies(seatTypesByFrequency);

  // Default the tab to the selected seat's frequency so coming Back from the
  // preview step reopens on the tab holding the selection.
  const initialFrequency = selectedSeat
    ? (seatPlans[selectedSeat]?.billingFrequency ?? null)
    : null;
  const [activeFrequency, setActiveFrequency] = useState<SeatBillingFrequency>(
    initialFrequency ?? availableFrequencies[0] ?? "monthly"
  );

  return (
    <div className="flex flex-col gap-3">
      {availableFrequencies.length > 1 && (
        <div className="mb-1 self-start">
          <BillingPeriodSwitch
            defaultValue={activeFrequency === "annual" ? "yearly" : "monthly"}
            onValueChange={(period) =>
              setActiveFrequency(period === "yearly" ? "annual" : "monthly")
            }
          />
        </div>
      )}

      {seatTypesByFrequency[activeFrequency].map((seatType) => {
        const info = seatPlans[seatType];
        if (!info || !isPaidSeatType(seatType)) {
          return null;
        }
        return (
          <SeatCard
            key={seatType}
            seatType={seatType}
            info={info}
            isSelected={selectedSeat === seatType}
            badge={getBadge(info)}
            onClick={() => onSelectSeat(seatType)}
          />
        );
      })}
    </div>
  );
}

interface BulkChangeSeatModalPreviewDialogContentProps {
  preview: BulkSeatChangePreviewBody;
  seatPlans: SeatPlanResponseBody;
}

// Confirm step: the immediate / next-billing-period move sections, the
// unchanged-members note and the per-seat-type summary table.
function BulkChangeSeatModalPreviewDialogContent({
  preview,
  seatPlans,
}: BulkChangeSeatModalPreviewDialogContentProps) {
  const immediateMoves = preview.moves.filter((m) => m.kind === "immediate");
  const deferredMoves = preview.moves.filter((m) => m.kind === "deferred");
  const unchangedCount = preview.moves
    .filter((m) => m.kind === "unchanged")
    .reduce((sum, m) => sum + m.count, 0);
  const seatTotals = preview.seatTotals ?? [];
  const hasAnyChange = immediateMoves.length > 0 || deferredMoves.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {immediateMoves.length > 0 && (
        <SeatMoveSection
          title="Immediate changes"
          moves={immediateMoves}
          deltaMonthlyCents={preview.immediateDeltaMonthlyCents}
          preview={preview}
          seatPlans={seatPlans}
        />
      )}
      {deferredMoves.length > 0 && (
        <SeatMoveSection
          title={
            preview.nextBillingPeriodAt
              ? `Changes on next billing period (${formatBillingPeriodDate(preview.nextBillingPeriodAt)})`
              : "Changes on next billing period"
          }
          moves={deferredMoves}
          deltaMonthlyCents={preview.deferredDeltaMonthlyCents}
          preview={preview}
          seatPlans={seatPlans}
        />
      )}
      {unchangedCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {unchangedCount.toLocaleString("en-US")}{" "}
          {unchangedCount === 1 ? "member is" : "members are"} already on{" "}
          {seatMoveLabel(
            preview.targetSeatType,
            preview.targetSeatName,
            seatPlans
          )}{" "}
          and won&apos;t change.
        </p>
      )}
      {seatTotals.length > 0 && hasAnyChange && (
        <SeatSummarySection seatTotals={seatTotals} seatPlans={seatPlans} />
      )}
    </div>
  );
}

type BulkChangeSeatStep = "pick" | "confirm";

function BulkChangeSeatForm({
  onClose,
  memberCount,
  selectedMembers,
  seatPlans,
  onFetchPreview,
  onValidate,
}: BulkChangeSeatFormProps) {
  const [selectedSeat, setSelectedSeat] = useState<PaidSeatType | null>(null);
  const [preview, setPreview] = useState<BulkSeatChangePreviewBody | null>(
    null
  );
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const step: BulkChangeSeatStep = preview === null ? "pick" : "confirm";

  async function handleNext() {
    if (!selectedSeat) {
      return;
    }
    setIsLoadingPreview(true);
    try {
      const fetched = await onFetchPreview(selectedSeat);
      if (fetched) {
        setPreview(fetched);
      }
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleValidate() {
    if (!selectedSeat || !preview) {
      return;
    }
    setIsSaving(true);
    try {
      const ok = await onValidate({
        seatType: selectedSeat,
        seatName: stripYearlySuffix(preview.targetSeatName),
        hasDeferredChanges: preview.moves.some((m) => m.kind === "deferred"),
      });
      if (ok) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <BulkChangeSeatModalHeader
        selectedMembers={selectedMembers}
        memberCount={preview?.memberCount ?? memberCount}
        step={step}
      />
      <DialogContainer>
        {step === "pick" ? (
          <BulkChangeSeatModalPickSeatDialogContent
            seatPlans={seatPlans}
            selectedSeat={selectedSeat}
            onSelectSeat={setSelectedSeat}
          />
        ) : (
          preview && (
            <BulkChangeSeatModalPreviewDialogContent
              preview={preview}
              seatPlans={seatPlans}
            />
          )
        )}
      </DialogContainer>
      {/* Plain buttons instead of DialogFooter's button props: those are
          wrapped in a DialogClose, which would close the dialog on "Next" /
          "Back" instead of switching steps. */}
      <DialogFooter>
        <Button
          label={step === "pick" ? "Cancel" : "Back"}
          variant="outline"
          onClick={step === "pick" ? onClose : () => setPreview(null)}
          disabled={isSaving}
        />
        {step === "pick" ? (
          <Button
            label="Review"
            variant="primary"
            disabled={!selectedSeat || isLoadingPreview}
            isLoading={isLoadingPreview}
            onClick={handleNext}
          />
        ) : (
          <Button
            label="Validate"
            variant="primary"
            disabled={isSaving}
            isLoading={isSaving}
            onClick={handleValidate}
          />
        )}
      </DialogFooter>
    </>
  );
}
