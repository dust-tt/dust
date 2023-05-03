import {
  WorkflowExecutionDescription,
  WorkflowHandle,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import { notionSyncWorkflow } from "@connectors/connectors/notion/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

const logger = mainLogger.child({ provider: "notion" });

function getWorkflowId(dataSourceConfig: DataSourceInfo) {
  return `workflow-notion-${dataSourceConfig.workspaceId}-${dataSourceConfig.dataSourceName}`;
}

export async function launchNotionSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string,
  startFromTs: number | null = null
) {
  const client = await getTemporalClient();

  const workflow = await getNotionWorkflow(dataSourceConfig);

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
    args: [dataSourceConfig, nangoConnectionId, startFromTs || undefined],
    taskQueue: QUEUE_NAME,
    workflowId: getWorkflowId(dataSourceConfig),
  });

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "launchNotionSyncWorkflow: Started Notion sync workflow."
  );
}

export async function stopNotionSyncWorkflow(
  dataSourceConfig: DataSourceInfo
): Promise<void> {
  const workflow = await getNotionWorkflow(dataSourceConfig);

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
}

export async function getNotionWorkflow(
  dataSourceInfo: DataSourceInfo
): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const handle: WorkflowHandle<typeof notionSyncWorkflow> =
    client.workflow.getHandle(getWorkflowId(dataSourceInfo));
  try {
    return { executionDescription: await handle.describe(), handle };
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return null;
    }
    throw e;
  }
}
