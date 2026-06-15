import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/metronome_events_queue/config";
import {
  cleanMetronomeInvoiceWorkflow,
  metronomeEventsWorkflow,
  reconcileWorkspaceUserCreditStatesWorkflow,
} from "@app/temporal/metronome_events_queue/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdReusePolicy,
} from "@temporalio/client";
import { WorkflowIdConflictPolicy } from "@temporalio/common";

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

// Defer the clean workflow so Metronome has finished writing all line items on
// the freshly created Stripe draft before we fetch and edit it.
const CLEAN_INVOICE_START_DELAY_MS = 60 * 1_000;

/**
 * Schedules cleaning + finalization of a Metronome-pushed Stripe draft invoice,
 * deferred by `CLEAN_INVOICE_START_DELAY_MS` (via Temporal `startDelay`, not a
 * `sleep`). The workflow id is derived from the invoice id so Stripe's
 * at-least-once `invoice.created` redeliveries dedup to a single workflow;
 * `ALLOW_DUPLICATE_FAILED_ONLY` lets a redelivery restart it if a prior attempt
 * ultimately failed.
 */
export async function launchCleanMetronomeInvoiceWorkflow({
  invoiceId,
  workspaceId,
}: {
  invoiceId: string;
  workspaceId: string;
}): Promise<Result<LaunchMetronomeEventsWorkflowOutcome, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `clean-metronome-invoice-${invoiceId}`;

  try {
    await client.workflow.start(cleanMetronomeInvoiceWorkflow, {
      args: [{ invoiceId, workspaceId }],
      memo: { invoiceId, workspaceId },
      taskQueue: QUEUE_NAME,
      workflowId,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      startDelay: CLEAN_INVOICE_START_DELAY_MS,
    });

    logger.info(
      { workflowId, invoiceId, workspaceId },
      "[Metronome Events] Started invoice clean workflow"
    );
    return new Ok("started");
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, invoiceId, workspaceId },
        "[Metronome Events] Invoice clean workflow already started (duplicate delivery), skipping"
      );
      return new Ok("already_started");
    }
    return new Err(normalizeError(err));
  }
}

/**
 * Launch a deduplicated credit-state reconcile for a workspace. Uses a stable
 * workspace-scoped workflow ID with `WorkflowIdConflictPolicy.USE_EXISTING` so
 * that the N concurrent `credit.segment.start` events fired during a seat-type
 * change collapse to a single workflow execution. After a reconcile completes,
 * `WorkflowIdReusePolicy.ALLOW_DUPLICATE` allows a fresh run for the next event.
 * Errors are logged but not propagated — a launch failure must not cause the
 * parent webhook workflow to retry.
 */
export async function launchReconcileWorkspaceUserCreditStatesWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `metronome-reconcile-${workspaceId}`;

  try {
    await client.workflow.start(reconcileWorkspaceUserCreditStatesWorkflow, {
      args: [{ workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    });
    logger.info(
      { workflowId, workspaceId },
      "[Metronome Reconcile] Launched credit state reconcile workflow"
    );
  } catch (err) {
    logger.error(
      { workflowId, workspaceId, err },
      "[Metronome Reconcile] Failed to launch credit state reconcile workflow"
    );
  }
}
