import {
  WorkflowExecutionDescription,
  WorkflowHandle,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/github/temporal/config";
import {
  getFullSyncWorkflowId,
  getIssueSyncWorkflowId,
  getReposSyncWorkflowId,
} from "@connectors/connectors/github/temporal/utils";
import {
  githubFullSyncWorkflow,
  githubIssueSyncWorkflow,
  githubReposSyncWorkflow,
} from "@connectors/connectors/github/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";

const logger = mainLogger.child({ provider: "github" });

export async function launchGithubFullSyncWorkflow(connectorId: string) {
  const client = await getTemporalClient();

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const githubInstallationId = connector.connectionId;

  const workflow = await getGithubFullSyncWorkflow(connectorId);

  if (workflow && workflow.executionDescription.status.name === "RUNNING") {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "launchGithubFullSyncWorkflow: Github full sync workflow already running."
    );
    return;
  }

  await client.workflow.start(githubFullSyncWorkflow, {
    args: [dataSourceConfig, githubInstallationId],
    taskQueue: QUEUE_NAME,
    workflowId: getFullSyncWorkflowId(dataSourceConfig),
  });
}

export async function getGithubFullSyncWorkflow(connectorId: string): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const handle: WorkflowHandle<typeof githubFullSyncWorkflow> =
    client.workflow.getHandle(getFullSyncWorkflowId(dataSourceConfig));

  try {
    return {
      executionDescription: await handle.describe(),
      handle,
    };
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      return null;
    }
    throw err;
  }
}

export async function launchGithubReposSyncWorkflow(
  connectorId: string,
  orgLogin: string,
  repos: { name: string; id: number }[]
) {
  const client = await getTemporalClient();

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const githubInstallationId = connector.connectionId;

  const workflow = await getGithubReposSyncWorkflow(connectorId);

  // TODO: figure out how we want to handle more than webhook for repositories_added
  if (workflow && workflow.executionDescription.status.name === "RUNNING") {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "launchGithubReposSyncWorkflow: Github repos sync workflow already running."
    );
    return;
  }

  await client.workflow.start(githubReposSyncWorkflow, {
    args: [dataSourceConfig, githubInstallationId, orgLogin, repos],
    taskQueue: QUEUE_NAME,
    workflowId: getReposSyncWorkflowId(dataSourceConfig),
  });
}

export async function getGithubReposSyncWorkflow(connectorId: string): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const handle: WorkflowHandle<typeof githubReposSyncWorkflow> =
    client.workflow.getHandle(getReposSyncWorkflowId(dataSourceConfig));

  try {
    return {
      executionDescription: await handle.describe(),
      handle,
    };
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      return null;
    }
    throw err;
  }
}

export async function launchGithubIssueSyncWorkflow(
  connectorId: string,
  repoLogin: string,
  repoName: string,
  repoId: number,
  issueNumber: number
) {
  const client = await getTemporalClient();

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const githubInstallationId = connector.connectionId;

  // TODO: figure out how we should handle concurrency limit here
  await client.workflow.start(githubIssueSyncWorkflow, {
    args: [
      dataSourceConfig,
      githubInstallationId,
      repoName,
      repoId,
      repoLogin,
      issueNumber,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: getIssueSyncWorkflowId(dataSourceConfig, repoId, issueNumber),
  });
}
