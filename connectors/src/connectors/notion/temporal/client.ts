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
  notionSyncWorkflow,
  updateOrphanedResourcesParentsWorkflow,
} from "@connectors/connectors/notion/temporal/workflows/";
import { notionGarbageCollectionWorkflow } from "@connectors/connectors/notion/temporal/workflows/garbage_collection";
import { processDatabaseUpsertQueueWorkflow } from "@connectors/connectors/notion/temporal/workflows/upsert_database_queue";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { NotionConnectorState } from "@connectors/lib/models/notion";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { getNotionWorkflowId } from "@connectors/types";

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
    workflowId: getNotionWorkflowId(connectorId, "sync"),
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
  await launchProcessDatabaseUpsertQueueWorkflow(connectorId);
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
    workflowId: getNotionWorkflowId(connectorId, "garbage-collector"),
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
  await stopProcessDatabaseUpsertQueueWorkflow(connectorId);
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

export async function stopProcessDatabaseUpsertQueueWorkflow(
  connectorId: ModelId
): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const workflow = await getProcessDatabaseUpsertQueueWorkflow(connectorId);

  if (!workflow) {
    logger.warn(
      {
        connectorId,
      },
      "stopProcessDatabaseUpsertQueueWorkflow: Process database upsert queue workflow not found."
    );
    return;
  }

  const { executionDescription: existingWorkflowExecution, handle } = workflow;

  if (existingWorkflowExecution.status.name !== "RUNNING") {
    logger.warn(
      {
        connectorId,
      },
      "stopProcessDatabaseUpsertQueueWorkflow: Process database upsert queue workflow is not running."
    );
    return;
  }

  logger.info(
    { connectorId },
    "Terminating existing Process database upsert queue workflow."
  );

  await handle.terminate();

  logger.info(
    { connectorId },
    "Terminated Process database upsert queue workflow."
  );
}

export async function launchUpdateOrphanedResourcesParentsWorkflow(
  connectorId: ModelId
) {
  const client = await getTemporalClient();

  const workflowId = `${getNotionWorkflowId(connectorId, "sync")}-update-orphaned-resources-parents`;

  await client.workflow.start(updateOrphanedResourcesParentsWorkflow, {
    args: [{ connectorId }],
    workflowId,
    taskQueue: QUEUE_NAME,
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId,
    },
  });
}

export async function launchProcessDatabaseUpsertQueueWorkflow(
  connectorId: ModelId
) {
  const client = await getTemporalClient();

  const workflow = await getProcessDatabaseUpsertQueueWorkflow(connectorId);

  if (workflow && workflow.executionDescription.status.name === "RUNNING") {
    logger.warn(
      {
        connectorId,
      },
      "launchProcessDatabaseUpsertQueueWorkflow: Process database upsert queue workflow already running."
    );
    return;
  }

  await client.workflow.start(processDatabaseUpsertQueueWorkflow, {
    args: [{ connectorId }],
    workflowId: getNotionWorkflowId(
      connectorId,
      "process-database-upsert-queue"
    ),
    taskQueue: QUEUE_NAME,
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId,
    },
  });

  logger.info(
    { connectorId },
    "launchProcessDatabaseUpsertQueueWorkflow: Started Notion process database upsert queue workflow."
  );
}

export async function getSyncWorkflow(connectorId: ModelId): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const handle:
    | WorkflowHandle<typeof notionSyncWorkflow>
    | WorkflowHandle<typeof notionGarbageCollectionWorkflow> =
    client.workflow.getHandle(getNotionWorkflowId(connectorId, "sync"));

  try {
    return { executionDescription: await handle.describe(), handle };
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return null;
    }
    throw e;
  }
}

export async function getGarbageCollectorWorkflow(
  connectorId: ModelId
): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const handle:
    | WorkflowHandle<typeof notionSyncWorkflow>
    | WorkflowHandle<typeof notionGarbageCollectionWorkflow> =
    client.workflow.getHandle(
      getNotionWorkflowId(connectorId, "garbage-collector")
    );

  try {
    return { executionDescription: await handle.describe(), handle };
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return null;
    }
    throw e;
  }
}

export async function getProcessDatabaseUpsertQueueWorkflow(
  connectorId: ModelId
): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const handle: WorkflowHandle<typeof processDatabaseUpsertQueueWorkflow> =
    client.workflow.getHandle(
      getNotionWorkflowId(connectorId, "process-database-upsert-queue")
    );

  try {
    return { executionDescription: await handle.describe(), handle };
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return null;
    }
    throw e;
  }
}
