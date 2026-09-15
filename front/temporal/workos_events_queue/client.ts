import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/workos_events_queue/config";
import { syncWorkOSITContactsSignal } from "@app/temporal/workos_events_queue/signals";
import {
  syncWorkOSITContactsWorkflow,
  workOSEventsWorkflow,
  workOSWorkspaceSubscriptionCreatedWorkflow,
} from "@app/temporal/workos_events_queue/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Event } from "@workos-inc/node";

export async function launchWorkOSEventsWorkflow({
  eventPayload,
}: {
  eventPayload: Event;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  const { event: eventType, id } = eventPayload;
  const workflowId = `workos-events-${eventType}-${id}-${Date.now()}`;

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

export async function launchSyncWorkOSITContactsWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  // Resolve the client outside the try so a repository configuration error from
  // `getTemporalClientForFrontNamespace()` propagates rather than being caught.
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = `workos-it-contacts-sync-${workspaceId}`;

  try {
    // `signalWithStart` coalesces: if a sync workflow is already running for this
    // workspace, the signal resets its debounce window instead of erroring, so an
    // "already started" execution needs no special handling.
    await client.workflow.signalWithStart(syncWorkOSITContactsWorkflow, {
      args: [{ workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: syncWorkOSITContactsSignal,
      signalArgs: undefined,
      memo: {
        workspaceId,
      },
    });

    return new Ok(undefined);
  } catch (error) {
    logger.error(
      { workflowId, workspaceId, error },
      "Failed to launch WorkOS IT contacts sync workflow"
    );

    return new Err(normalizeError(error));
  }
}

export async function launchWorkOSWorkspaceSubscriptionCreatedWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();

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
