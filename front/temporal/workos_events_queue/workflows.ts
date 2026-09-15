import type * as activities from "@app/temporal/workos_events_queue/activities";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";
import type { Event } from "@workos-inc/node";

import { syncWorkOSITContactsSignal } from "./signals";

// Debounce window for the IT-contacts sync: bursts of membership changes within
// the window (e.g. a bulk import) coalesce into a single trailing sync.
const SYNC_WORKOS_IT_CONTACTS_DEBOUNCE_MS = 60 * 60 * 1000;

const {
  handleWorkspaceSubscriptionCreated,
  processWorkOSEventActivity,
  syncWorkOSITContactsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function workOSEventsWorkflow({
  eventPayload,
}: {
  eventPayload: Event;
}) {
  await processWorkOSEventActivity({ eventPayload });
}

export async function workOSWorkspaceSubscriptionCreatedWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  await handleWorkspaceSubscriptionCreated({ workspaceId });
}

// Debounced per-workspace sync of workspace admins into WorkOS IT contacts.
// signalWithStart on a stable per-workspace workflow id coalesces repeated
// triggers (org creation, membership add/remove/role change) within the
// debounce window into a single trailing sync.
export async function syncWorkOSITContactsWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  let signaled = false;

  setHandler(syncWorkOSITContactsSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(SYNC_WORKOS_IT_CONTACTS_DEBOUNCE_MS);
    if (signaled) {
      continue;
    }

    await syncWorkOSITContactsActivity({ workspaceId });
  }

  // /!\ Any signal received outside of the while loop will be lost, so don't make
  // any async call here, which would let the signal handler run in between.
}
