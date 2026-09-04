import type { PlanUpdatedEvent } from "@app/types/assistant/conversation";

export interface PlanUpdatedDeps {
  // Drop the cached plan to null without revalidating (close is authoritative, and keeps cross-client
  // close independent of endpoint timing).
  writeClosedToCache: () => void;
  // Trigger an SWR revalidation of the plan key (SWR owns request ordering, so a stale revalidation
  // resolving after a later close is discarded).
  revalidatePlan: () => void;
}

// Reacts to a `plan_updated` event: on close, drop the cache to null; on create/edit, revalidate.
// Opening and closing the panel is owned by PlanPanelButton, which reacts to the resulting content
// change.
// Pulled out of ConversationViewer to be unit-testable.
export function handlePlanUpdatedEvent(
  event: PlanUpdatedEvent,
  deps: PlanUpdatedDeps
): void {
  if (event.isClosed) {
    deps.writeClosedToCache();
    return;
  }

  deps.revalidatePlan();
}
