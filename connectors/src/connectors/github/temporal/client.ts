import type {
  WorkflowExecutionDescription,
  WorkflowHandle,
} from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/github/temporal/config";
import { newWebhookSignal } from "@connectors/connectors/github/temporal/signals";
import {
  getCodeSyncDailyCronWorkflowId,
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
  githubCodeSyncDailyCronWorkflow,
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
import type { ModelId } from "@connectors/types";

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

  const workflow = await getGithubFullSyncWorkflow(connectorId);

  if (workflow && workflow.executionDescription.status.name === "RUNNING") {
    logger.warn(
      {
        connectorId,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        syncCodeOnly,
      },
      "launchGithubFullSyncWorkflow: Github full sync workflow already running."
    );
    return;
  }

  await client.workflow.start(githubFullSyncWorkflow, {
    args: [dataSourceConfig, connectorId, syncCodeOnly, forceCodeResync],
    taskQueue: QUEUE_NAME,
    workflowId: getFullSyncWorkflowId(connectorId),
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

  const handle: WorkflowHandle<typeof githubFullSyncWorkflow> =
    client.workflow.getHandle(getFullSyncWorkflowId(connectorId));

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

  await client.workflow.start(githubReposSyncWorkflow, {
    args: [dataSourceConfig, connectorId, orgLogin, repos],
    taskQueue: QUEUE_NAME,
    workflowId: getReposSyncWorkflowId(connectorId),
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
  repoId: number,
  cronSchedule?: string
) {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await client.workflow.signalWithStart(githubCodeSyncWorkflow, {
    args: [dataSourceConfig, connectorId, repoName, repoId, repoLogin],
    taskQueue: QUEUE_NAME,
    workflowId: getCodeSyncWorkflowId(connectorId, repoId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    cronSchedule,
    signal: newWebhookSignal,
    signalArgs: undefined,
    memo: {
      connectorId: connectorId,
    },
  });
}

export async function launchGithubCodeSyncDailyCronWorkflow(
  connectorId: ModelId,
  repoLogin: string,
  repoName: string,
  repoId: number
) {
  const client = await getTemporalClient();

  await client.workflow.signalWithStart(githubCodeSyncDailyCronWorkflow, {
    args: [connectorId, repoName, repoId, repoLogin],
    taskQueue: QUEUE_NAME,
    workflowId: getCodeSyncDailyCronWorkflowId(connectorId, repoId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    // every day
    cronSchedule: "0 0 * * *",
    signal: newWebhookSignal,
    signalArgs: undefined,
    memo: {
      connectorId: connectorId,
    },
  });
}

export async function launchGithubIssueSyncWorkflow(
  connectorId: ModelId,
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

  const workflowId = getIssueSyncWorkflowId(connectorId, repoId, issueNumber);

  await client.workflow.signalWithStart(githubIssueSyncWorkflow, {
    args: [
      dataSourceConfig,
      connector.id,
      repoName,
      repoId,
      repoLogin,
      issueNumber,
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
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

export async function launchGithubDiscussionSyncWorkflow(
  connectorId: ModelId,
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

  const workflowId = getDiscussionSyncWorkflowId(
    connectorId,
    repoId,
    discussionNumber
  );

  await client.workflow.signalWithStart(githubDiscussionSyncWorkflow, {
    args: [
      dataSourceConfig,
      connectorId,
      repoName,
      repoId,
      repoLogin,
      discussionNumber,
    ],
    searchAttributes: {
      connectorId: [connectorId],
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
  connectorId: ModelId,
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

  await client.workflow.start(githubIssueGarbageCollectWorkflow, {
    args: [dataSourceConfig, connectorId, repoId.toString(), issueNumber],
    taskQueue: QUEUE_NAME,
    searchAttributes: {
      connectorId: [connectorId],
    },
    workflowId: getIssueGarbageCollectWorkflowId(
      connectorId,
      repoId,
      issueNumber
    ),
    memo: {
      connectorId: connectorId,
    },
  });
}

export async function launchGithubDiscussionGarbageCollectWorkflow(
  connectorId: ModelId,
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

  await client.workflow.start(githubDiscussionGarbageCollectWorkflow, {
    args: [dataSourceConfig, connectorId, repoId.toString(), discussionNumber],
    memo: {
      connectorId: connectorId,
    },
    taskQueue: QUEUE_NAME,
    workflowId: getDiscussionGarbageCollectWorkflowId(
      connectorId,
      repoId,
      discussionNumber
    ),
    searchAttributes: {
      connectorId: [connectorId],
    },
  });
}

export async function launchGithubRepoGarbageCollectWorkflow(
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

  await client.workflow.start(githubRepoGarbageCollectWorkflow, {
    args: [dataSourceConfig, connectorId, repoId.toString()],
    taskQueue: QUEUE_NAME,
    workflowId: getRepoGarbageCollectWorkflowId(connectorId, repoId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId: connectorId,
    },
  });
}
