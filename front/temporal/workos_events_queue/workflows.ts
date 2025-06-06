import { proxyActivities } from "@temporalio/workflow";
import type { Event } from "@workos-inc/node";

import type * as activities from "@app/temporal/workos_events_queue/activities";

const { processWorkOSEventActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function workosEventsWorkflow({
  eventPayload,
}: {
  eventPayload: Event;
}) {
  await processWorkOSEventActivity({ eventPayload });
}
