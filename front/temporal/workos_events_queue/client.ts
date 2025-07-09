import type { Event } from "@workos-inc/node";

import { getTemporalClient } from "@app/lib/temporal";
import { QUEUE_NAME } from "@app/temporal/workos_events_queue/config";
import {
  workOSEventsWorkflow,
  workOSWorkspaceSubscriptionCreatedWorkflow,
} from "@app/temporal/workos_events_queue/workflows";
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
    await client.workflow.start(workOSEventsWorkflow, {
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

export async function launchWorkOSWorkspaceSubscriptionCreatedWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `workos-workspace-subscription-created-${workspaceId}`;

  try {
    await client.workflow.start(workOSWorkspaceSubscriptionCreatedWorkflow, {
      args: [{ workspaceId }],
      memo: {
        eventType: "workspace_subscription_created",
      },
      taskQueue: QUEUE_NAME,
      workflowId,
    });

    return new Ok(workflowId);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
