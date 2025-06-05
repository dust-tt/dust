import type { Event } from "@workos-inc/node";

import { getTemporalClient } from "@app/lib/temporal";
import { QUEUE_NAME } from "@app/temporal/workos_events_queue/config";
import { workosEventsWorkflow } from "@app/temporal/workos_events_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function launchWorkOSEventsWorkflow({
  eventPayload,
}: {
  eventPayload: Event;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const { event: eventType } = eventPayload;
  const workflowId = `workos-events-${eventType}-${Date.now()}`;

  try {
    await client.workflow.start(workosEventsWorkflow, {
      args: [{ eventPayload }],
      memo: {
        eventType,
      },
      taskQueue: QUEUE_NAME,
      workflowId,
    });

    return new Ok(workflowId);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
