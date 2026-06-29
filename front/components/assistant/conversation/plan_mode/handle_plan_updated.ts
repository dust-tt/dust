import type { GetConversationPlanModeResponseBody } from "@app/types/api/assistant/plan_mode";
import type { PlanUpdatedEvent } from "@app/types/assistant/conversation";

export interface PlanUpdatedDeps {
  isMobile: boolean;
  isPlanPanelOpen: boolean;
  // Latch: true once the panel has auto-opened for the current plan, so edits don't reopen it.
  autoOpenedRef: { current: boolean };
  // Drop the cached plan to null without revalidating.
  writeClosedToCache: () => void;
  // Revalidate the plan and resolve with the fresh body.
  revalidate: () => Promise<GetConversationPlanModeResponseBody | undefined>;
  openPlanPanel: () => void;
  closePanel: () => void;
}

// Decides how the UI reacts to a `plan_updated` event. Pulled out of ConversationViewer so the
// close→reopen behavior this guards is unit-testable without rendering the conversation. Never
// rejects (the create path catches), so callers can `void` it.
export async function handlePlanUpdatedEvent(
  event: PlanUpdatedEvent,
  deps: PlanUpdatedDeps
): Promise<void> {
  if (event.isClosed) {
    // Authoritative close: drop the cache to null (no refetch, which could race a quick subsequent
    // create) and re-arm auto-open for the next plan.
    deps.autoOpenedRef.current = false;
    deps.writeClosedToCache();
    if (deps.isPlanPanelOpen) {
      deps.closePanel();
    }
    return;
  }

  // Create/edit: claim auto-open synchronously so rapid edits don't double-open; release it if the
  // fetch is empty or fails so a later update can still open.
  const shouldAutoOpen = !deps.autoOpenedRef.current && !deps.isMobile;
  if (shouldAutoOpen) {
    deps.autoOpenedRef.current = true;
  }
  try {
    const data = await deps.revalidate();
    if (!shouldAutoOpen) {
      return;
    }
    // A close that landed while this revalidation was in flight resets the latch; bail so a stale
    // result can't reopen the panel for a plan that is no longer active. (SWR already discards the
    // stale revalidation's cache write, so the card stays closed too.)
    if (!deps.autoOpenedRef.current) {
      return;
    }
    if (data?.content) {
      deps.openPlanPanel();
    } else {
      deps.autoOpenedRef.current = false;
    }
  } catch {
    if (shouldAutoOpen && deps.autoOpenedRef.current) {
      deps.autoOpenedRef.current = false;
    }
  }
}
