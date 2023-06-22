import {
  WorkflowExecutionDescription,
  WorkflowHandle,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/github/temporal/config";
import { newWebhookSignal } from "@connectors/connectors/github/temporal/signals";
import {
  getDiscussionSyncWorkflowId,
  getFullSyncWorkflowId,
  getIssueSyncWorkflowId,
  getReposSyncWorkflowId,
} from "@connectors/connectors/github/temporal/utils";
import {
  githubDiscussionSyncWorkflow,
  githubFullSyncWorkflow,
  githubIssueGarbageCollectWorkflow,
  githubIssueSyncWorkflow,
  githubRepoGarbageCollectWorkflow,
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

  await client.workflow.start(githubReposSyncWorkflow, {
    args: [dataSourceConfig, githubInstallationId, orgLogin, repos],
    taskQueue: QUEUE_NAME,
    workflowId: getReposSyncWorkflowId(dataSourceConfig),
  });
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

  const workflowId = getIssueSyncWorkflowId(
    dataSourceConfig,
    repoId,
    issueNumber
  );

  await client.workflow.signalWithStart(githubIssueSyncWorkflow, {
    args: [
      dataSourceConfig,
      githubInstallationId,
      repoName,
      repoId,
      repoLogin,
      issueNumber,
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
    signal: newWebhookSignal,
    signalArgs: undefined,
  });
}

export async function launchGithubDiscussionSyncWorkflow(
  connectorId: string,
  repoLogin: string,
  repoName: string,
  repoId: number,
  discussionNumber: number
) {
  const client = await getTemporalClient();

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const githubInstallationId = connector.connectionId;

  const workflowId = getDiscussionSyncWorkflowId(
    connectorId,
    dataSourceConfig,
    repoId,
    discussionNumber
  );

  await client.workflow.signalWithStart(githubDiscussionSyncWorkflow, {
    args: [
      dataSourceConfig,
      githubInstallationId,
      repoName,
      repoId,
      repoLogin,
      discussionNumber,
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
    signal: newWebhookSignal,
    signalArgs: undefined,
  });
}

export async function launchGithubIssueGarbageCollectWorkflow(
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

  await client.workflow.start(githubIssueGarbageCollectWorkflow, {
    args: [
      dataSourceConfig,
      githubInstallationId,
      repoId.toString(),
      issueNumber,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: getIssueSyncWorkflowId(dataSourceConfig, repoId, issueNumber),
  });
}

export async function launchGithubRepoGarbageCollectWorkflow(
  connectorId: string,
  repoLogin: string,
  repoName: string,
  repoId: number
) {
  const client = await getTemporalClient();

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const githubInstallationId = connector.connectionId;

  await client.workflow.start(githubRepoGarbageCollectWorkflow, {
    args: [dataSourceConfig, githubInstallationId, repoId.toString()],
    taskQueue: QUEUE_NAME,
    workflowId: getIssueSyncWorkflowId(dataSourceConfig, repoId, 0),
  });
}
