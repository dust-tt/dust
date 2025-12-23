import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { REGISTERED_CHECKS } from "./activities";
import { QUEUE_NAME } from "./config";
import { runAllChecksWorkflow, runSingleCheckWorkflow } from "./workflows";

export async function launchProductionChecksWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = "production_checks";
  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.terminate();
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      throw e;
    }
  }
  try {
    await client.workflow.start(runAllChecksWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      cronSchedule: "20 * * * *", // every hour, on 20 minutes past the hour
    });
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(normalizeError(e));
  }
}

export async function startManualCheckWorkflow(
  checkName: string
): Promise<Result<string, Error>> {
  const check = REGISTERED_CHECKS.find((c) => c.name === checkName);
  if (!check) {
    return new Err(
      new Error(
        `Unknown check: ${checkName}. Valid checks: ${REGISTERED_CHECKS.map((c) => c.name).join(", ")}`
      )
    );
  }

  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `production_check_manual_${checkName}_${Date.now()}`;

  try {
    await client.workflow.start(runSingleCheckWorkflow, {
      args: [checkName],
      taskQueue: QUEUE_NAME,
      workflowId,
    });
    logger.info({ workflowId, checkName }, "Started manual check workflow");
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      { workflowId, checkName, error: e },
      "Failed starting manual check workflow"
    );
    return new Err(normalizeError(e));
  }
}
