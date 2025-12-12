import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdReusePolicy,
} from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import { QUEUE_NAME } from "./config";
import { creditAlertWorkflow } from "./workflows";

export interface LaunchCreditAlertWorkflowArgs {
  workspaceId: string;
  creditAlertThresholdKey: string;
  totalInitialMicroUsd: number;
  totalConsumedMicroUsd: number;
}

/**
 * Launches a Temporal workflow to send credit alert emails when usage reaches threshold.
 *
 * Uses `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY` to achieve idempotency:
 * - The workflow ID is deterministic: `credit-alert-${workspaceId}-${creditAlertThresholdKey}`
 * - If a workflow with this ID already completed successfully, a new one cannot start,
 *   preventing duplicate alert emails for the same threshold breach.
 * - If a previous workflow failed (e.g., email service down), a retry is allowed.
 * - When multiple concurrent calls detect the threshold breach, only one workflow runs;
 *   others receive `WorkflowExecutionAlreadyStartedError` (expected, handled silently).
 *
 * The `creditAlertThresholdKey` encodes the current credit configuration (free + committed
 * credit IDs + threshold %), so alerts reset when credits are renewed or changed.
 */
export async function launchCreditAlertWorkflow({
  workspaceId,
  creditAlertThresholdKey,
  totalInitialMicroUsd,
  totalConsumedMicroUsd,
}: LaunchCreditAlertWorkflowArgs): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `credit-alert-${workspaceId}-${creditAlertThresholdKey}`;

  try {
    await client.workflow.start(creditAlertWorkflow, {
      args: [{ workspaceId, totalInitialMicroUsd, totalConsumedMicroUsd }],
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        workspaceId,
        creditAlertThresholdKey,
      },
    });

    logger.info(
      { workflowId, workspaceId, creditAlertThresholdKey },
      "[Credit Alert] Started credit alert workflow"
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, workspaceId, creditAlertThresholdKey },
        "[Credit Alert] Credit alert workflow already started (idempotency check passed)"
      );
      return;
    }
    logger.error(
      { workflowId, workspaceId, creditAlertThresholdKey, error: e },
      "[Credit Alert] Failed to start credit alert workflow"
    );
    throw e;
  }
}
