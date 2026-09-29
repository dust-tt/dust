import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";

// PostHog events for conversational suggestion cards. `trackEvent` names them
// `conversation:<object>:<action>`.

export type SuggestionPileBulkAction =
  | "allow_all"
  | "reject_all"
  | "allow_remaining";

/**
 * @cc [owner:avervaet,label:product] suggestion-events-name-the-batches
 * Suggestion events MUST carry the id of the batch they act on (`batch_id`), or the ids of every
 * batch a bulk review acts on (`batch_ids`), so an event can be joined to the suggestions shown.
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
  targetKind: "agent" | "skill";
  targetId: string;
}): void {
  trackEvent({
    area: TRACKING_AREAS.CONVERSATION,
    object: "suggestion_target_preview",
    action: TRACKING_ACTIONS.OPEN,
    extra: { batch_id: batchId, target_kind: targetKind, target_id: targetId },
  });
}
