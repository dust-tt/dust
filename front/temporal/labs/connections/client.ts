import type { WorkflowHandle } from "@temporalio/client";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { CONNECTIONS_QUEUE_NAME } from "@app/temporal/labs/connections/config";
import { makeLabsConnectionWorkflowId } from "@app/temporal/labs/connections/utils";
import {
  fullSyncLabsConnectionWorkflow,
  incrementalSyncLabsConnectionWorkflow,
} from "@app/temporal/labs/connections/workflows";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function launchLabsConnectionWorkflow(
  connectionConfiguration: LabsConnectionsConfigurationResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeLabsConnectionWorkflowId({
    connectionConfiguration,
  });

  try {
    // First run a full sync
    await client.workflow.start(fullSyncLabsConnectionWorkflow, {
      args: [connectionConfiguration.id],
      taskQueue: CONNECTIONS_QUEUE_NAME,
      workflowId: `${scheduleId}-full`,
      memo: {
        configurationId: connectionConfiguration.id,
        dataSourceId: connectionConfiguration.dataSourceViewId,
      },
    });

    // Then set up an hourly schedule for incremental syncs
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: incrementalSyncLabsConnectionWorkflow,
        args: [connectionConfiguration.id],
        taskQueue: CONNECTIONS_QUEUE_NAME,
      },
      scheduleId: `${scheduleId}-incremental`,
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        intervals: [{ every: "1h" }],
      },
      memo: {
        configurationId: connectionConfiguration.id,
        dataSourceId: connectionConfiguration.dataSourceViewId,
      },
    });

    logger.info(
      {
        scheduleId,
      },
      "Labs connection sync workflow and schedule started."
    );
    return new Ok(scheduleId);
  } catch (e) {
    if (e instanceof ScheduleAlreadyRunning) {
      return new Ok(scheduleId);
    }
    logger.error(
      {
        scheduleId,
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
  const scheduleId = makeLabsConnectionWorkflowId({ connectionConfiguration });

  try {
    // Stop any running full sync workflow
    try {
      const handle: WorkflowHandle<typeof fullSyncLabsConnectionWorkflow> =
        client.workflow.getHandle(`${scheduleId}-full`);
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }

    // Delete the incremental sync schedule
    try {
      const handle = client.schedule.getHandle(`${scheduleId}-incremental`);
      await handle.delete();
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
        scheduleId,
        error: e,
      },
      "Failed stopping workflow."
    );
    return new Err(e as Error);
  }
}
