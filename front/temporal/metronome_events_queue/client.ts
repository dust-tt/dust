import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/metronome_events_queue/config";
import { metronomeEventsWorkflow } from "@app/temporal/metronome_events_queue/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdReusePolicy,
} from "@temporalio/client";

/**
 * Outcome of attempting to enqueue a Metronome webhook event for processing.
 *
 * - `started`: a fresh workflow was created and is now executing (or queued).
 * - `already_started`: a workflow with the same id already exists and was either
 *   running or completed — Temporal rejected the duplicate. The caller should
 *   ack the webhook delivery: this is exactly the dedup guarantee we want for
 *   Metronome's at-least-once delivery.
 */
export type LaunchMetronomeEventsWorkflowOutcome =
  | "started"
  | "already_started";

export async function launchMetronomeEventsWorkflow({
  event,
  workspaceId,
}: {
  event: MetronomeWebhookEvent;
  workspaceId: string;
}): Promise<Result<LaunchMetronomeEventsWorkflowOutcome, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  // Workflow id is derived from event.id so Temporal's WorkflowIdReusePolicy
  // gives us idempotency for free against Metronome redeliveries (network
  // timeouts, our own 5xx). ALLOW_DUPLICATE_FAILED_ONLY lets a redelivery
  // restart the workflow if a previous attempt ultimately failed.
  const workflowId = `metronome-events-${event.id}`;

  try {
    await client.workflow.start(metronomeEventsWorkflow, {
      args: [{ event, workspaceId }],
      memo: {
        eventId: event.id,
        eventType: event.type,
        workspaceId,
      },
      taskQueue: QUEUE_NAME,
      workflowId,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
    });

    logger.info(
      { workflowId, eventId: event.id, eventType: event.type, workspaceId },
      "[Metronome Events] Started workflow"
    );
    return new Ok("started");
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, eventId: event.id, eventType: event.type, workspaceId },
        "[Metronome Events] Workflow already started (duplicate delivery), skipping"
      );
      return new Ok("already_started");
    }
    return new Err(normalizeError(err));
  }
}
