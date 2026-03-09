import type * as activities from "@app/temporal/workos_events_queue/activities";
import { proxyActivities } from "@temporalio/workflow";
import type { Event } from "@workos-inc/node";

const { handleWorkspaceSubscriptionCreated, processWorkOSEventActivity } =
  proxyActivities<typeof activities>({
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
