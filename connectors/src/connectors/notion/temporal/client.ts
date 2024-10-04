import type { ModelId } from "@dust-tt/types";
import { getNotionWorkflowId } from "@dust-tt/types";
import type {
  WorkflowExecutionDescription,
  WorkflowHandle,
} from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  GARBAGE_COLLECT_QUEUE_NAME,
  QUEUE_NAME,
} from "@connectors/connectors/notion/temporal/config";
import {
  notionGarbageCollectionWorkflow,
  notionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/workflows/";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { NotionConnectorState } from "@connectors/lib/models/notion";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const logger = mainLogger.child({ provider: "notion" });

export async function launchNotionSyncWorkflow(
  connectorId: ModelId,
  startFromTs: number | null = null,
  forceResync = false
) {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId,
    },
  });
  if (!notionConnectorState) {
    throw new Error(
      `NotionConnectorState not found. ConnectorId: ${connectorId}`
    );
  }

  const workflow = await getSyncWorkflow(connectorId);

  if (workflow && workflow.executionDescription.status.name === "RUNNING") {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "launchNotionSyncWorkflow: Notion sync workflow already running."
    );
    return;
  }

  await client.workflow.start(notionSyncWorkflow, {
    args: [
      {
        connectorId,
        startFromTs,
        forceResync,
      },
    ],
    taskQueue: QUEUE_NAME,
    workflowId: getNotionWorkflowId(connectorId, false),
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId,
    },
  });

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "launchNotionSyncWorkflow: Started Notion sync workflow."
  );

  await launchNotionGarbageCollectorWorkflow(connectorId);
}

export async function launchNotionGarbageCollectorWorkflow(
  connectorId: ModelId
) {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflow = await getGarbageCollectorWorkflow(connectorId);

  if (workflow && workflow.executionDescription.status.name === "RUNNING") {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "launchNotionGarbageCollectorWorkflow: Notion garbage collector workflow already running."
    );
    return;
  }

  await client.workflow.start(notionGarbageCollectionWorkflow, {
    args: [
      {
        connectorId,
      },
    ],
    taskQueue: GARBAGE_COLLECT_QUEUE_NAME,
    workflowId: getNotionWorkflowId(connectorId, true),
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId,
    },
  });

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "launchNotionGarbageCollectorWorkflow: Started Notion garbage collector workflow."
  );
}

export async function stopNotionSyncWorkflow(
  connectorId: ModelId
): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId,
    },
  });
  if (!notionConnectorState) {
    throw new Error(
      `NotionConnectorState not found. ConnectorId: ${connectorId}`
    );
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const workflow = await getSyncWorkflow(connectorId);

  if (!workflow) {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "stopNotionSyncWorkflow: Notion sync workflow not found."
    );
    return;
  }

  const { executionDescription: existingWorkflowExecution, handle } = workflow;

  if (existingWorkflowExecution.status.name !== "RUNNING") {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "stopNotionSyncWorkflow: Notion sync workflow is not running."
    );
    return;
  }

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "Terminating existing Notion sync workflow."
  );

  await handle.terminate();

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId, provider: "notion" },
    "Terminated Notion sync workflow."
  );

  await stopNotionGarbageCollectorWorkflow(connectorId);
}

export async function stopNotionGarbageCollectorWorkflow(
  connectorId: ModelId
): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const workflow = await getGarbageCollectorWorkflow(connectorId);

  if (!workflow) {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "stopNotionGarbageCollectorWorkflow: Notion garbage collector workflow not found."
    );
    return;
  }

  const { executionDescription: existingWorkflowExecution, handle } = workflow;

  if (existingWorkflowExecution.status.name !== "RUNNING") {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "stopNotionGarbageCollectorWorkflow: Notion garbage collector workflow is not running."
    );
    return;
  }

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "Terminating existing Notion garbage collector workflow."
  );

  await handle.terminate();

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId, provider: "notion" },
    "Terminated Notion garbage collector workflow."
  );
}

async function getSyncWorkflow(connectorId: ModelId): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const handle:
    | WorkflowHandle<typeof notionSyncWorkflow>
    | WorkflowHandle<typeof notionGarbageCollectionWorkflow> =
    client.workflow.getHandle(getNotionWorkflowId(connectorId, false));

  try {
    return { executionDescription: await handle.describe(), handle };
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return null;
    }
    throw e;
  }
}

async function getGarbageCollectorWorkflow(connectorId: ModelId): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const handle:
    | WorkflowHandle<typeof notionSyncWorkflow>
    | WorkflowHandle<typeof notionGarbageCollectionWorkflow> =
    client.workflow.getHandle(getNotionWorkflowId(connectorId, true));

  try {
    return { executionDescription: await handle.describe(), handle };
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return null;
    }
    throw e;
  }
}
