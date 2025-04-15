import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { CONNECTIONS_QUEUE_NAME } from "@app/temporal/labs/connections/config";
import { makeLabsConnectionWorkflowId } from "@app/temporal/labs/connections/utils";
import { syncLabsConnectionWorkflow } from "@app/temporal/labs/connections/workflows";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function launchLabsConnectionWorkflow(
  connectionConfiguration: LabsConnectionsConfigurationResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeLabsConnectionWorkflowId(connectionConfiguration);

  try {
    await client.workflow.start(syncLabsConnectionWorkflow, {
      args: [connectionConfiguration.id],
      taskQueue: CONNECTIONS_QUEUE_NAME,
      workflowId: workflowId,
      // cronSchedule: "*/5 * * * *",
      memo: {
        configurationId: connectionConfiguration.id,
        dataSourceId: connectionConfiguration.dataSourceViewId,
      },
    });
    logger.info(
      {
        workflowId,
      },
      "Labs connection sync workflow started."
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Labs connection sync workflow failed."
    );
    return new Err(e as Error);
  }
}

export async function stopLabsConnectionWorkflow(
  connectionConfiguration: LabsConnectionsConfigurationResource,
  setInactive: boolean = true
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeLabsConnectionWorkflowId(connectionConfiguration);

  try {
    const handle: WorkflowHandle<typeof syncLabsConnectionWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    if (setInactive) {
      await connectionConfiguration.setIsEnabled(false);
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed stopping workflow."
    );
    return new Err(e as Error);
  }
}
