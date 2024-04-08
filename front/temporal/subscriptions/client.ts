import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import { QUEUE_NAME } from "./config";
import { warnExpiringEnterpriseSubscriptionsWorkflow } from "./workflows";

export async function launchWarnExpiringWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClient();

  const workflowId = "warn_expiring_enterprise_subscriptions";
  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.terminate();
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      throw e;
    }
  }
  try {
    await client.workflow.start(warnExpiringEnterpriseSubscriptionsWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      cronSchedule: "0 0 * * *", // every day at midnight
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
