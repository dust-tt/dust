import type { ModelId } from "@dust-tt/types";
import type {
  WorkflowExecutionDescription,
  WorkflowHandle,
} from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/github/temporal/config";
import { newWebhookSignal } from "@connectors/connectors/github/temporal/signals";
import {
  getCodeSyncWorkflowId,
  getDiscussionGarbageCollectWorkflowId,
  getDiscussionSyncWorkflowId,
  getFullSyncWorkflowId,
  getIssueGarbageCollectWorkflowId,
  getIssueSyncWorkflowId,
  getRepoGarbageCollectWorkflowId,
  getReposSyncWorkflowId,
} from "@connectors/connectors/github/temporal/utils";
import {
  githubCodeSyncWorkflow,
  githubDiscussionGarbageCollectWorkflow,
  githubDiscussionSyncWorkflow,
  githubFullSyncWorkflow,
  githubIssueGarbageCollectWorkflow,
  githubIssueSyncWorkflow,
  githubRepoGarbageCollectWorkflow,
  githubReposSyncWorkflow,
} from "@connectors/connectors/github/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const logger = mainLogger.child({ provider: "github" });

export async function launchGithubFullSyncWorkflow({
  connectorId,
  syncCodeOnly,
  forceCodeResync = false,
}: {
  connectorId: ModelId;
  syncCodeOnly: boolean;
  forceCodeResync?: boolean;
}) {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const connectionId = connector.connectionId;

  const workflow = await getGithubFullSyncWorkflow(connectorId);

  if (workflow && workflow.executionDescription.status.name === "RUNNING") {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
        syncCodeOnly,
      },
      "launchGithubFullSyncWorkflow: Github full sync workflow already running."
    );
    return;
  }

  await client.workflow.start(githubFullSyncWorkflow, {
    args: [
      dataSourceConfig,
      connectionId,
      connectorId,
      syncCodeOnly,
      forceCodeResync,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: getFullSyncWorkflowId(dataSourceConfig),
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId: connectorId,
    },
  });
}

export async function getGithubFullSyncWorkflow(connectorId: ModelId): Promise<{
  executionDescription: WorkflowExecutionDescription;
  handle: WorkflowHandle;
} | null> {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
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
  connectorId: ModelId,
  orgLogin: string,
  repos: { name: string; id: number }[]
) {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectionId = connector.connectionId;

  await client.workflow.start(githubReposSyncWorkflow, {
    args: [dataSourceConfig, connectionId, orgLogin, repos, connectorId],
    taskQueue: QUEUE_NAME,
    workflowId: getReposSyncWorkflowId(dataSourceConfig),
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId: connectorId,
    },
  });
}

export async function launchGithubCodeSyncWorkflow(
  connectorId: ModelId,
  repoLogin: string,
  repoName: string,
  repoId: number
) {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectionId = connector.connectionId;

  await client.workflow.signalWithStart(githubCodeSyncWorkflow, {
    args: [dataSourceConfig, connectionId, repoName, repoId, repoLogin],
    taskQueue: QUEUE_NAME,
    workflowId: getCodeSyncWorkflowId(dataSourceConfig, repoId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    signal: newWebhookSignal,
    signalArgs: undefined,
    memo: {
      connectorId: connectorId,
    },
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

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectionId = connector.connectionId;

  const workflowId = getIssueSyncWorkflowId(
    dataSourceConfig,
    repoId,
    issueNumber
  );

  await client.workflow.signalWithStart(githubIssueSyncWorkflow, {
    args: [
      dataSourceConfig,
      connectionId,
      repoName,
      repoId,
      repoLogin,
      issueNumber,
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
    searchAttributes: {
      connectorId: [parseInt(connectorId)],
    },
    signal: newWebhookSignal,
    signalArgs: undefined,
    memo: {
      connectorId: connectorId,
    },
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

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectionId = connector.connectionId;

  const workflowId = getDiscussionSyncWorkflowId(
    connectorId,
    dataSourceConfig,
    repoId,
    discussionNumber
  );

  await client.workflow.signalWithStart(githubDiscussionSyncWorkflow, {
    args: [
      dataSourceConfig,
      connectionId,
      repoName,
      repoId,
      repoLogin,
      discussionNumber,
    ],
    searchAttributes: {
      connectorId: [parseInt(connectorId)],
    },
    taskQueue: QUEUE_NAME,
    workflowId,
    signal: newWebhookSignal,
    signalArgs: undefined,
    memo: {
      connectorId: connectorId,
    },
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

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectionId = connector.connectionId;

  await client.workflow.start(githubIssueGarbageCollectWorkflow, {
    args: [dataSourceConfig, connectionId, repoId.toString(), issueNumber],
    taskQueue: QUEUE_NAME,
    searchAttributes: {
      connectorId: [parseInt(connectorId)],
    },
    workflowId: getIssueGarbageCollectWorkflowId(
      dataSourceConfig,
      repoId,
      issueNumber
    ),
    memo: {
      connectorId: connectorId,
    },
  });
}

export async function launchGithubDiscussionGarbageCollectWorkflow(
  connectorId: string,
  repoLogin: string,
  repoName: string,
  repoId: number,
  discussionNumber: number
) {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectionId = connector.connectionId;

  await client.workflow.start(githubDiscussionGarbageCollectWorkflow, {
    args: [dataSourceConfig, connectionId, repoId.toString(), discussionNumber],
    memo: {
      connectorId: connectorId,
    },
    taskQueue: QUEUE_NAME,
    workflowId: getDiscussionGarbageCollectWorkflowId(
      connectorId,
      dataSourceConfig,
      repoId,
      discussionNumber
    ),
    searchAttributes: {
      connectorId: [parseInt(connectorId)],
    },
  });
}

export async function launchGithubRepoGarbageCollectWorkflow(
  connectorId: string,
  repoLogin: string,
  repoName: string,
  repoId: number
) {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectionId = connector.connectionId;

  await client.workflow.start(githubRepoGarbageCollectWorkflow, {
    args: [dataSourceConfig, connectionId, repoId.toString()],
    taskQueue: QUEUE_NAME,
    workflowId: getRepoGarbageCollectWorkflowId(dataSourceConfig, repoId),
    searchAttributes: {
      connectorId: [parseInt(connectorId)],
    },
    memo: {
      connectorId: connectorId,
    },
  });
}
