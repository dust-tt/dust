import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdReusePolicy,
} from "@temporalio/client";

import { QUEUE_NAME } from "./config";
import {
  creditAlertWorkflow,
  expirePoolCapOverridesWorkflow,
} from "./workflows";

interface LaunchCreditAlertWorkflowArgs {
  workspaceId: string;
  creditAlertThresholdKey: string;
  totalInitialMicroUsd: number;
  totalConsumedMicroUsd: number;
}

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

export const SPEND_LIMIT_EXPIRATION_SCHEDULE_ID =
  "spend-limit-expiration-schedule";

/**
 * Ensures the spend limit expiration schedule exists. Called from the worker
 * on startup (see `worker.ts`) instead of a one-off admin command, so a fresh
 * environment self-registers its schedule.
 */
export async function launchSpendLimitExpirationSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = SPEND_LIMIT_EXPIRATION_SCHEDULE_ID;

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: expirePoolCapOverridesWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      scheduleId,
      policies: {
        overlap: ScheduleOverlapPolicy.BUFFER_ONE,
      },
      spec: {
        // Every hour at minute 0 — bounds how long an expired override can
        // linger before being reverted.
        cronExpressions: ["0 * * * *"],
        timezone: "UTC",
      },
    });

    logger.info("Created spend limit expiration schedule.");
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) {
      logger.error({ err }, "Failed to start spend limit expiration schedule.");

      return new Err(normalizeError(err));
    }
  }

  return new Ok(undefined);
}
