import { QUEUE_NAME } from "@connectors/connectors/dust_project/temporal/config";
import { dustProjectSyncSignal } from "@connectors/connectors/dust_project/temporal/signals";
import {
  dustProjectFullSyncWorkflow,
  dustProjectFullSyncWorkflowId,
  dustProjectIncrementalSyncNowWorkflow,
  dustProjectIncrementalSyncNowWorkflowId,
  dustProjectIncrementalSyncWorkflow,
  dustProjectIncrementalSyncWorkflowId,
} from "@connectors/connectors/dust_project/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/common";

export async function launchDustProjectFullSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const workflowId = dustProjectFullSyncWorkflowId(connectorId);

  try {
    await client.workflow.start(dustProjectFullSyncWorkflow, {
      args: [{ connectorId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId,
      },
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started dust_project full sync workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting dust_project full sync workflow.`
    );
    return new Err(normalizeError(e));
  }
}

export async function launchDustProjectIncrementalSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const workflowId = dustProjectIncrementalSyncWorkflowId(connectorId);

  // Spread hourly jobs across the hour by connector ID.
  const minuteOffset = connector.id % 60;
  const cronSchedule = `${minuteOffset} * * * *`;

  try {
    // Check if workflow already exists
    const workflowAlreadyRunning = await (async () => {
      try {
        const wfHandle: WorkflowHandle<
          typeof dustProjectIncrementalSyncWorkflow
        > = client.workflow.getHandle(workflowId);
        const description = await wfHandle.describe();
        return description.status.name === "RUNNING";
      } catch (_err) {
        return false;
      }
    })();

    // Use start with cron schedule for periodic incremental syncs
    // If workflow already exists, terminate it first to update the schedule
    if (workflowAlreadyRunning) {
      await terminateWorkflow(workflowId);
    }

    await client.workflow.start(dustProjectIncrementalSyncWorkflow, {
      args: [{ connectorId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId,
      },
      cronSchedule,
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        cronSchedule,
      },
      `Started dust_project incremental sync workflow with cron schedule.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting dust_project incremental sync workflow.`
    );
    return new Err(normalizeError(e));
  }
}

/**
 * Signal (or start) a debounced on-demand incremental sync.
 * Does not touch the hourly cron workflow.
 */
export async function signalDustProjectIncrementalSync(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  if (connector.isPaused()) {
    logger.info(
      { connectorId },
      "Skipping dust_project incremental sync signal because connector is paused."
    );
    return new Ok(dustProjectIncrementalSyncNowWorkflowId(connectorId));
  }

  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const workflowId = dustProjectIncrementalSyncNowWorkflowId(connectorId);

  try {
    await client.workflow.signalWithStart(
      dustProjectIncrementalSyncNowWorkflow,
      {
        args: [{ connectorId }],
        taskQueue: QUEUE_NAME,
        workflowId,
        searchAttributes: {
          connectorId: [connectorId],
        },
        memo: {
          connectorId,
        },
        signal: dustProjectSyncSignal,
        signalArgs: undefined,
      }
    );
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Signaled dust_project incremental sync now workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed signaling dust_project incremental sync now workflow.`
    );
    return new Err(normalizeError(e));
  }
}

export async function stopDustProjectSyncWorkflow({
  connectorId,
  stopReason,
}: {
  connectorId: ModelId;
  stopReason: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const workflowIds = [
    dustProjectFullSyncWorkflowId(connectorId),
    dustProjectIncrementalSyncWorkflowId(connectorId),
    dustProjectIncrementalSyncNowWorkflowId(connectorId),
  ];

  try {
    for (const workflowId of workflowIds) {
      try {
        const handle = client.workflow.getHandle(workflowId);
        await handle.terminate(stopReason);
      } catch (e) {
        if (!(e instanceof WorkflowNotFoundError)) {
          throw e;
        }
      }
    }

    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        connectorId,
        error: e,
      },
      "Failed to stop dust_project workflows."
    );
    return new Err(normalizeError(e));
  }
}
