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
  thresholdId: string;
  totalInitialMicroUsd: number;
  totalConsumedMicroUsd: number;
}

export async function launchCreditAlertWorkflow({
  workspaceId,
  thresholdId,
  totalInitialMicroUsd: totalInitialCents,
  totalConsumedMicroUsd: totalConsumedCents,
}: LaunchCreditAlertWorkflowArgs): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `credit-alert-${workspaceId}-${thresholdId}`;

  try {
    await client.workflow.start(creditAlertWorkflow, {
      args: [{ workspaceId, totalInitialCents, totalConsumedCents }],
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        workspaceId,
        thresholdId,
      },
    });

    logger.info(
      { workflowId, workspaceId, thresholdId },
      "Started credit alert workflow"
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, workspaceId, thresholdId },
        "Credit alert workflow already started (idempotency check passed)"
      );
      return;
    }
    logger.error(
      { workflowId, workspaceId, thresholdId, error: e },
      "Failed to start credit alert workflow"
    );
    throw e;
  }
}
