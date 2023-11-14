import { WorkflowNotFoundError } from "@temporalio/client";

import { Err, Ok, Result } from "@app/lib/result";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import { QUEUE_NAME } from "./config";
import { runAllChecksWorkflow } from "./workflows";

export async function launchProductionChecksWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClient();

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
      cronSchedule: "0 * * * *", // every hour, on the hour
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
    return new Err(e as Error);
  }
}
