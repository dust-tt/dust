import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/common";

import { QUEUE_NAME } from "@connectors/connectors/dust_project/temporal/config";
import {
  dustProjectFullSyncWorkflow,
  dustProjectFullSyncWorkflowId,
  dustProjectGarbageCollectWorkflow,
  dustProjectGarbageCollectWorkflowId,
  dustProjectIncrementalSyncWorkflow,
  dustProjectIncrementalSyncWorkflowId,
} from "@connectors/connectors/dust_project/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

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

  try {
    // Terminate existing workflow if running
    await terminateWorkflow(workflowId);
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
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started dust_project incremental sync workflow.`
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

export async function launchDustProjectGarbageCollectWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const workflowId = dustProjectGarbageCollectWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof dustProjectGarbageCollectWorkflow> =
      client.workflow.getHandle(workflowId);

    // If the workflow is running, do nothing
    try {
      const description = await handle.describe();
      if (description.status.name === "RUNNING") {
        logger.info(
          {
            workspaceId: dataSourceConfig.workspaceId,
            workflowId,
          },
          `Dust project GC workflow is already running, not relaunching.`
        );
        return new Ok(workflowId);
      }
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }

    await client.workflow.start(dustProjectGarbageCollectWorkflow, {
      args: [{ connectorId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      // Run garbage collection daily
      cronSchedule: "0 2 * * *",
      memo: {
        connectorId,
      },
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started dust_project garbage collection workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting dust_project garbage collection workflow.`
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

  const fullSyncWorkflowId = dustProjectFullSyncWorkflowId(connectorId);
  const incrementalSyncWorkflowId =
    dustProjectIncrementalSyncWorkflowId(connectorId);

  try {
    // Terminate full sync workflow if running
    try {
      const fullSyncHandle: WorkflowHandle<typeof dustProjectFullSyncWorkflow> =
        client.workflow.getHandle(fullSyncWorkflowId);
      await fullSyncHandle.terminate(stopReason);
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }

    // Terminate incremental sync workflow if running
    try {
      const incrementalSyncHandle: WorkflowHandle<
        typeof dustProjectIncrementalSyncWorkflow
      > = client.workflow.getHandle(incrementalSyncWorkflowId);
      await incrementalSyncHandle.terminate(stopReason);
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
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
