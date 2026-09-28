import {
  getBatchSuggestionTitle,
  PendingBatchSuggestionCard,
} from "@app/components/markdown/suggestion/BatchSuggestionDirective";
import { DEFAULT_SUGGESTION_VISUAL } from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import { getSuggestionStateChip } from "@app/components/skill_builder/SkillSuggestionCard";
import {
  useReviewSuggestionBatches,
  useSuggestionBatches,
} from "@app/hooks/useSuggestionBatches";
import type { SuggestionBatchReviewState } from "@app/types/api/assistant/suggestion_batches";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionCardStack,
  Avatar,
  Button,
  Card,
  Chip,
  Edit04,
  LoadingBlock,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { cloneElement, useState } from "react";

const ENTRY_VISUAL = cloneElement(DEFAULT_SUGGESTION_VISUAL, { size: "xs" });

function formatEditCount(count: number): string {
  return `${count} edit${pluralize(count)}`;
}

// Same text colors as the state chips, so outcome counts read like the chips listed below them.
const OUTCOME_TEXT_CLASS_NAMES: Record<
  NonNullable<ReturnType<typeof getSuggestionStateChip>>["color"],
  string
> = {
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-warning-700",
  primary: "text-primary-700",
};

// E.g. "3 accepted, 1 declined", leaving out outcomes nobody got.
function formatReviewOutcomes(batches: BatchSuggestionType[]): ReactNode {
  return (["approved", "rejected", "outdated"] as const)
    .flatMap((state) => {
      const count = batches.filter((b) => b.state === state).length;
      const chip = getSuggestionStateChip(state);
      return count > 0 && chip ? [{ state, count, chip }] : [];
    })
    .map(({ state, count, chip }, index) => (
      <span key={state}>
        {index > 0 && ", "}
        <span className={OUTCOME_TEXT_CLASS_NAMES[chip.color]}>
          {count} {chip.label.toLowerCase()}
        </span>
      </span>
    ));
}

interface SuggestionStateChipProps {
  state: BatchSuggestionType["state"];
}

function SuggestionStateChip({ state }: SuggestionStateChipProps) {
  const chip = getSuggestionStateChip(state);
  if (!chip) {
    return null;
  }
  return (
    <Chip
      size="xs"
      color={chip.color}
      icon={chip.icon}
      label={chip.label}
      className="ml-auto shrink-0"
    />
  );
}

interface SuggestionPileSummaryCardProps {
  title: ReactNode;
  /** Summary written by the agent before review; `batches` are listed when missing. */
  recap: string | null;
  batches: BatchSuggestionType[];
  /** Always lists `batches` with their review outcome, below the recap if any. */
  showBatchState?: boolean;
  actions?: ReactNode;
}

function SuggestionPileSummaryCard({
  title,
  recap,
  batches,
  showBatchState = false,
  actions,
}: SuggestionPileSummaryCardProps) {
  return (
    <Card
      variant="secondary"
      size="md"
      containerClassName="w-full max-w-lg"
      className="flex flex-col gap-4 shadow"
    >
      <div className="flex items-center gap-2">
        <Avatar icon={Edit04} size="sm" backgroundColor="bg-muted-background" />
        <span className="heading-base text-foreground">{title}</span>
      </div>
      {recap && <p className="text-sm text-muted-foreground">{recap}</p>}
      {(!recap || showBatchState) && (
        <ul className="flex flex-col gap-2">
          {batches.map((batch) => (
            <li key={batch.id} className="flex min-w-0 items-center gap-2">
              {ENTRY_VISUAL}
              <span className="truncate text-sm text-muted-foreground">
                {getBatchSuggestionTitle(batch)}
              </span>
              {showBatchState && <SuggestionStateChip state={batch.state} />}
            </li>
          ))}
        </ul>
      )}
      {actions}
    </Card>
  );
}

interface SuggestionPileRecapActionsProps {
  isBusy: boolean;
  bulkState: SuggestionBatchReviewState | null;
  onReview: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

function SuggestionPileRecapActions({
  isBusy,
  bulkState,
  onReview,
  onAcceptAll,
  onRejectAll,
}: SuggestionPileRecapActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost-secondary"
        size="sm"
        label="Reject all"
        onClick={onRejectAll}
        disabled={isBusy}
        isLoading={bulkState === "rejected"}
      />
      <div className="ml-auto flex gap-2">
        <Button
          variant="outline"
          size="sm"
          label="Accept all"
          onClick={onAcceptAll}
          disabled={isBusy}
          isLoading={bulkState === "approved"}
        />
        <Button
          variant="highlight"
          size="sm"
          label="Review"
          onClick={onReview}
          disabled={isBusy}
        />
      </div>
    </div>
  );
}

interface InFlightReview {
  // `null` when every pending batch of the pile is being reviewed at once.
  batchId: string | null;
  state: SuggestionBatchReviewState;
}

interface ConversationSuggestionPileProps {
  owner: LightWorkspaceType;
  batchIds: string[];
  recap: string | null;
}

/**
 * @cc [owner:avervaet,label:product] bulk-review-pending-only
 * "Accept all", "Reject all" and "Accept remaining" MUST only review batches of this pile that are
 * still pending, and MUST leave a batch pending when its review request fails.
 */
export function ConversationSuggestionPile({
  owner,
  batchIds,
  recap,
}: ConversationSuggestionPileProps) {
  const { batches, isBatchesLoading, mutateBatches } = useSuggestionBatches({
    batchIds,
    workspaceId: owner.sId,
  });
  const reviewBatches = useReviewSuggestionBatches({
    workspaceId: owner.sId,
    mutateBatches,
  });

  const [isReviewing, setIsReviewing] = useState(false);
  const [inFlight, setInFlight] = useState<InFlightReview | null>(null);

  if (isBatchesLoading) {
    return <LoadingBlock className="h-24 w-full max-w-lg" />;
  }

  const batchesById = new Map(batches.map((b) => [b.id, b]));
  const pileBatches = batchIds.flatMap((id) => batchesById.get(id) ?? []);
  if (pileBatches.length === 0) {
    return null;
  }

  const pendingBatches = pileBatches.filter((b) => b.state === "pending");
  const isBusy = inFlight !== null;
  const bulkState = inFlight?.batchId === null ? inFlight.state : null;

  // Without a batch, every pending batch of the pile is reviewed, in pile order.
  const review = async (
    state: SuggestionBatchReviewState,
    batch?: BatchSuggestionType
  ) => {
    setInFlight({ batchId: batch?.id ?? null, state });
    try {
      await reviewBatches(
        (batch ? [batch] : pendingBatches).map((b) => b.id),
        state
      );
    } finally {
      setInFlight(null);
    }
  };

  // Only the front card is interactive; the ones behind it are drawn as decorative layers.
  if (pendingBatches.length === 0) {
    return (
      <ActionCardStack cardCount={1}>
        <SuggestionPileSummaryCard
          title={
            <>
              {formatEditCount(pileBatches.length)} reviewed ·{" "}
              {formatReviewOutcomes(pileBatches)}
            </>
          }
          recap={recap}
          batches={pileBatches}
          showBatchState
        />
      </ActionCardStack>
    );
  }

  // The recap card is part of the pile, on top of the pending batches.
  if (!isReviewing) {
    return (
      <ActionCardStack cardCount={pendingBatches.length + 1}>
        <SuggestionPileSummaryCard
          title={`${formatEditCount(pendingBatches.length)} ready for your review`}
          recap={recap}
          batches={pendingBatches}
          actions={
            <SuggestionPileRecapActions
              isBusy={isBusy}
              bulkState={bulkState}
              onReview={() => setIsReviewing(true)}
              onAcceptAll={() => void review("approved")}
              onRejectAll={() => void review("rejected")}
            />
          }
        />
      </ActionCardStack>
    );
  }

  const batch = pendingBatches[0];
  const cardState = inFlight?.batchId === batch.id ? inFlight.state : null;
  return (
    <ActionCardStack cardCount={pendingBatches.length}>
      <PendingBatchSuggestionCard
        owner={owner}
        batch={batch}
        onAccept={() => void review("approved", batch)}
        onReject={() => void review("rejected", batch)}
        disabled={isBusy}
        isAccepting={cardState === "approved"}
        isDeclining={cardState === "rejected"}
        titleAside={`Edit ${pileBatches.indexOf(batch) + 1} of ${pileBatches.length}`}
        secondaryAction={
          <Button
            variant="ghost-secondary"
            size="sm"
            label="Accept remaining"
            onClick={() => void review("approved")}
            disabled={isBusy}
            isLoading={bulkState === "approved"}
          />
        }
      />
    </ActionCardStack>
  );
}
