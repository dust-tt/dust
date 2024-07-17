import type { ModelId } from "@dust-tt/types";
import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/github/temporal/activities";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

import { newWebhookSignal } from "./signals";
import { getFullSyncWorkflowId, getReposSyncWorkflowId } from "./utils";

const { githubSaveStartSyncActivity, githubSaveSuccessSyncActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

const {
  githubGetReposResultPageActivity,
  githubGetRepoIssuesResultPageActivity,
  githubGetRepoDiscussionsResultPageActivity,
  githubIssueGarbageCollectActivity,
  githubDiscussionGarbageCollectActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

const { githubRepoGarbageCollectActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "20 minute",
  }
);

const { githubUpsertIssueActivity, githubUpsertDiscussionActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minute",
  });

const { githubCodeSyncActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "180 minute",
  // We use a rather large heartbeat as we have to allow enough time for the initial code tar
  // download to complete (should be less than a few GB). But this is nonetheless valuable compared
  // to just relying on startToCloseTimeout (which has to be large enough to allow the full initial
  // sync, which can only be done in one activity since it is stateful (download of tar file to
  // local temp storage)). Basically In case of a deploy or crash of the worker node we will retry
  // the activity after 15mn and not 180 as defined by the startToCloseTimeout.
  heartbeatTimeout: "15 minute",
});

const MAX_CONCURRENT_REPO_SYNC_WORKFLOWS = 3;
const MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW = 8;

export async function githubFullSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  connectorId: ModelId,
  // Used to re-trigger a code-only full-sync after code syncing is enabled/disabled.
  syncCodeOnly: boolean,
  forceCodeResync = false
) {
  await githubSaveStartSyncActivity(dataSourceConfig);
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    syncCodeOnly: syncCodeOnly.toString(),
  };

  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  let pageNumber = 1; // 1-indexed

  for (;;) {
    const resultsPage = await githubGetReposResultPageActivity(
      connectionId,
      pageNumber,
      loggerArgs
    );
    if (!resultsPage.length) {
      break;
    }
    pageNumber += 1;

    for (const repo of resultsPage) {
      const fullSyncWorkflowId = getFullSyncWorkflowId(dataSourceConfig);
      const childWorkflowId = `${fullSyncWorkflowId}-repo-${repo.id}-syncCodeOnly-${syncCodeOnly}`;
      promises.push(
        queue.add(() =>
          executeChild(githubRepoSyncWorkflow, {
            workflowId: childWorkflowId,
            searchAttributes: {
              connectorId: [connectorId],
            },
            args: [
              {
                dataSourceConfig,
                connectorId,
                connectionId,
                repoName: repo.name,
                repoId: repo.id,
                repoLogin: repo.login,
                syncCodeOnly,
                isFullSync: true,
                forceCodeResync,
              },
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
            memo: workflowInfo().memo,
          })
        )
      );
    }
  }

  await Promise.all(promises);

  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubReposSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  orgLogin: string,
  repos: { name: string; id: number }[],
  connectorId: ModelId
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  for (const repo of repos) {
    const reposSyncWorkflowId = getReposSyncWorkflowId(dataSourceConfig);
    const childWorkflowId = `${reposSyncWorkflowId}-repo-${repo.id}`;
    promises.push(
      queue.add(() =>
        executeChild(githubRepoSyncWorkflow, {
          workflowId: childWorkflowId,
          searchAttributes: {
            connectorId: [connectorId],
          },
          args: [
            {
              dataSourceConfig,
              connectorId,
              connectionId,
              repoName: repo.name,
              repoId: repo.id,
              repoLogin: orgLogin,
              syncCodeOnly: false,
              isFullSync: false,
            },
          ],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          memo: workflowInfo().memo,
        })
      )
    );
  }

  await Promise.all(promises);
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubRepoIssuesSyncWorkflow({
  dataSourceConfig,
  connectionId,
  repoName,
  repoId,
  repoLogin,
  pageNumber,
}: {
  dataSourceConfig: DataSourceConfig;
  connectionId: string;
  repoName: string;
  repoId: number;
  repoLogin: string;
  pageNumber: number;
}): Promise<boolean> {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    repoName,
    repoLogin,
  };

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
  });
  const promises: Promise<void>[] = [];

  const resultsPage = await githubGetRepoIssuesResultPageActivity(
    connectionId,
    repoName,
    repoLogin,
    pageNumber,
    loggerArgs
  );

  if (!resultsPage.length) {
    return false;
  }

  for (const issueNumber of resultsPage) {
    promises.push(
      queue.add(() =>
        githubUpsertIssueActivity(
          connectionId,
          repoName,
          repoId,
          repoLogin,
          issueNumber,
          dataSourceConfig,
          loggerArgs,
          true // isBatchSync
        )
      )
    );
  }

  await Promise.all(promises);

  return true;
}

export async function githubRepoDiscussionsSyncWorkflow({
  dataSourceConfig,
  connectionId,
  repoName,
  repoId,
  repoLogin,
  nextCursor,
}: {
  dataSourceConfig: DataSourceConfig;
  connectionId: string;
  repoName: string;
  repoId: number;
  repoLogin: string;
  nextCursor: string | null;
}): Promise<string | null> {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    repoName,
    repoLogin,
  };

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
  });
  const promises: Promise<void>[] = [];

  const { cursor, discussionNumbers } =
    await githubGetRepoDiscussionsResultPageActivity(
      connectionId,
      repoName,
      repoLogin,
      nextCursor,
      loggerArgs
    );

  for (const discussionNumber of discussionNumbers) {
    promises.push(
      queue.add(() =>
        githubUpsertDiscussionActivity(
          connectionId,
          repoName,
          repoId,
          repoLogin,
          discussionNumber,
          dataSourceConfig,
          loggerArgs,
          true // isBatchSync
        )
      )
    );
  }

  await Promise.all(promises);

  return cursor;
}

export async function githubRepoSyncWorkflow({
  dataSourceConfig,
  connectorId,
  connectionId,
  repoName,
  repoId,
  repoLogin,
  syncCodeOnly,
  isFullSync,
  forceCodeResync = false,
}: {
  dataSourceConfig: DataSourceConfig;
  connectorId: ModelId;
  connectionId: string;
  repoName: string;
  repoId: number;
  repoLogin: string;
  syncCodeOnly: boolean;
  isFullSync: boolean;
  forceCodeResync?: boolean;
}) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    repoName,
    repoLogin,
    syncCodeOnly: syncCodeOnly ? "true" : "false",
  };

  if (!syncCodeOnly) {
    let pageNumber = 1; // 1-indexed
    for (;;) {
      const childWorkflowId = `${
        isFullSync
          ? getFullSyncWorkflowId(dataSourceConfig)
          : getReposSyncWorkflowId(dataSourceConfig)
      }-repo-${repoId}-issues-page-${pageNumber}`;

      const shouldContinue = await executeChild(githubRepoIssuesSyncWorkflow, {
        workflowId: childWorkflowId,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [
          {
            dataSourceConfig,
            connectionId,
            repoName,
            repoId,
            repoLogin,
            pageNumber,
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });

      if (!shouldContinue) {
        break;
      }
      pageNumber += 1;
    }

    let nextCursor: string | null = null;
    let cursorIteration = 0;
    for (;;) {
      const childWorkflowId = `${
        isFullSync
          ? getFullSyncWorkflowId(dataSourceConfig)
          : getReposSyncWorkflowId(dataSourceConfig)
      }-repo-${repoId}-issues-page-${cursorIteration}`;

      nextCursor = await executeChild(githubRepoDiscussionsSyncWorkflow, {
        workflowId: childWorkflowId,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [
          {
            dataSourceConfig,
            connectionId,
            repoName,
            repoId,
            repoLogin,
            nextCursor,
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });

      if (!nextCursor) {
        break;
      }
      cursorIteration += 1;
    }
  }

  // Start code syncing activity.
  await githubCodeSyncActivity({
    dataSourceConfig,
    connectionId,
    repoLogin,
    repoName,
    repoId,
    loggerArgs,
    isBatchSync: true,
    forceResync: forceCodeResync,
  });
}

export async function githubCodeSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  repoName: string,
  repoId: number,
  repoLogin: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    repoName,
    repoLogin,
  };

  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    // The main motivation for debouncing here is to ensure that concurrent PR merges don't launch
    // multiple workflows. In the webhook for PR merge we send a signal after updating the
    // GithubCodeRepository.lastSeenAt (if was older than the sync interval), but we can still race
    // at this layer for a few seconds, hence the use of signals here.
    await sleep(10000);
    if (signaled) {
      debounceCount += 1;
      continue;
    }
    await githubCodeSyncActivity({
      dataSourceConfig,
      connectionId,
      repoLogin,
      repoName,
      repoId,
      loggerArgs: { ...loggerArgs, debounceCount, activity: "githubCodeSync" },
      isBatchSync: true,
    });
    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubIssueSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  repoName: string,
  repoId: number,
  repoLogin: string,
  issueNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    repoName,
    repoLogin,
    issueNumber,
  };

  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount += 1;
      continue;
    }
    await githubUpsertIssueActivity(
      connectionId,
      repoName,
      repoId,
      repoLogin,
      issueNumber,
      dataSourceConfig,
      { ...loggerArgs, debounceCount }
    );
    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubDiscussionSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  repoName: string,
  repoId: number,
  repoLogin: string,
  discussionNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    repoName,
    repoLogin,
    discussionNumber,
  };

  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount += 1;
      continue;
    }
    await githubUpsertDiscussionActivity(
      connectionId,
      repoName,
      repoId,
      repoLogin,
      discussionNumber,
      dataSourceConfig,
      { ...loggerArgs, debounceCount },
      false // isBatchSync
    );

    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubIssueGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  repoId: string,
  issueNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    issueNumber,
  };

  await githubIssueGarbageCollectActivity(
    dataSourceConfig,
    connectionId,
    repoId,
    issueNumber,
    loggerArgs
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubDiscussionGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  repoId: string,
  discussionNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
    discussionNumber,
  };

  await githubDiscussionGarbageCollectActivity(
    dataSourceConfig,
    connectionId,
    repoId,
    discussionNumber,
    loggerArgs
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubRepoGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  repoId: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    connectionId,
  };

  await githubRepoGarbageCollectActivity(
    dataSourceConfig,
    connectionId,
    repoId,
    loggerArgs
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}
