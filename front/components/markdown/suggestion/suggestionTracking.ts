import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import { useEffect, useRef } from "react";

// PostHog events for conversational suggestion cards. `trackEvent` names them
// `conversation:<object>:<action>`.

export type SuggestionPileBulkAction =
  | "allow_all"
  | "reject_all"
  | "allow_remaining"
  | "review";

type SuggestionTargetKind = "agent" | "skill";

/**
 * @cc [owner:avervaet,label:product] suggestion-events-name-the-batches
 * Suggestion events MUST carry the id of the batch they act on (`batch_id`), or the ids of every
 * batch a pile action acts on (`batch_ids`), so an event can be joined to the suggestions shown.
 */
export function trackSuggestionDetailsOpen({
  batchId,
}: {
  batchId: string;
}): void {
  trackEvent({
    area: TRACKING_AREAS.CONVERSATION,
    object: "suggestion_details",
    action: TRACKING_ACTIONS.OPEN,
    extra: { batch_id: batchId },
  });
}

export function trackSuggestionPileBulkReview({
  bulkAction,
  batchIds,
}: {
  bulkAction: SuggestionPileBulkAction;
  batchIds: string[];
}): void {
  trackEvent({
    area: TRACKING_AREAS.CONVERSATION,
    object: `suggestion_pile_${bulkAction}`,
    action: TRACKING_ACTIONS.CLICK,
    extra: { batch_ids: batchIds.join(","), batch_count: batchIds.length },
  });
}

export function trackSuggestionTargetPreviewOpen({
  batchId,
  targetKind,
  targetId,
}: {
  batchId: string;
  targetKind: SuggestionTargetKind;
  targetId: string;
}): void {
  trackEvent({
    area: TRACKING_AREAS.CONVERSATION,
    object: "suggestion_target_preview",
    action: TRACKING_ACTIONS.OPEN,
    extra: { batch_id: batchId, target_kind: targetKind, target_id: targetId },
  });
}

/**
 * @cc [owner:avervaet,label:product] suggestion-card-view-once-per-mount
 * A view MUST be tracked once per pending batch for as long as the tracking component stays
 * mounted: re-renders and later state changes of the batch MUST NOT track it again, and a batch
 * that is not pending when first seen MUST NOT be tracked.
 */
export function useTrackSuggestionCardViews(
  batches: BatchSuggestionType[],
  { inPile }: { inPile: boolean }
): void {
  const seenBatchIds = useRef(new Set<string>());

  useEffect(() => {
    for (const batch of batches) {
      if (seenBatchIds.current.has(batch.id)) {
        continue;
      }
      seenBatchIds.current.add(batch.id);
      if (batch.state === "pending") {
        trackEvent({
          area: TRACKING_AREAS.CONVERSATION,
          object: "suggestion_card",
          action: TRACKING_ACTIONS.VIEW,
          extra: { batch_id: batch.id, in_pile: inPile },
        });
      }
    }
  }, [batches, inPile]);
}

export function trackSuggestionCardDecision({
  decision,
  batchId,
  inPile,
}: {
  decision: "allow" | "decline";
  batchId: string;
  inPile: boolean;
}): void {
  trackEvent({
    area: TRACKING_AREAS.CONVERSATION,
    object: `suggestion_card_${decision}`,
    action: TRACKING_ACTIONS.CLICK,
    extra: { batch_id: batchId, in_pile: inPile },
  });
}

export function trackSuggestionPreviewEdit({
  batchId,
  targetKind,
  targetId,
}: {
  batchId: string;
  targetKind: SuggestionTargetKind;
  targetId: string;
}): void {
  trackEvent({
    area: TRACKING_AREAS.CONVERSATION,
    object: "suggestion_preview_edit",
    action: TRACKING_ACTIONS.CLICK,
    extra: { batch_id: batchId, target_kind: targetKind, target_id: targetId },
  });
}

export function trackSuggestionPreviewToggle({
  batchId,
  targetKind,
  showing,
}: {
  batchId: string;
  targetKind: SuggestionTargetKind;
  showing: "suggested" | "current";
}): void {
  trackEvent({
    area: TRACKING_AREAS.CONVERSATION,
    object: "suggestion_preview_toggle",
    action: TRACKING_ACTIONS.CLICK,
    extra: { batch_id: batchId, target_kind: targetKind, showing },
  });
}
