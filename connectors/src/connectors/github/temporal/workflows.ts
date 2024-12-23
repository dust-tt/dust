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

const {
  githubSaveStartSyncActivity,
  githubSaveSuccessSyncActivity,
  githubCodeSyncDailyCronActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

const {
  githubGetReposResultPageActivity,
  githubGetRepoIssuesResultPageActivity,
  githubGetRepoDiscussionsResultPageActivity,
  githubIssueGarbageCollectActivity,
  githubDiscussionGarbageCollectActivity,
  githubUpsertDiscussionsFolderActivity,
  githubUpsertIssuesFolderActivity,
  githubUpsertRepositoryFolderActivity,
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

/**
 * This workflow is used to fetch and sync all the repositories of a GitHub connector.
 * It's called v2 because we had to add it when there was already a workflow without the v2 to avoid non-deterministic errors.
 */
export async function githubFullSyncWorkflowV2(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  // Used to re-trigger a code-only full-sync after code syncing is enabled/disabled.
  syncCodeOnly: boolean,
  forceCodeResync = false
) {
  await githubSaveStartSyncActivity(dataSourceConfig);

  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  let pageNumber = 1; // 1-indexed

  for (;;) {
    const resultsPage = await githubGetReposResultPageActivity(
      connectorId,
      pageNumber,
      { syncCodeOnly: syncCodeOnly.toString() }
    );
    if (!resultsPage.length) {
      break;
    }
    pageNumber += 1;

    for (const repo of resultsPage) {
      const fullSyncWorkflowId = getFullSyncWorkflowId(connectorId);
      const childWorkflowId = `${fullSyncWorkflowId}-repo-${repo.id}-syncCodeOnly-${syncCodeOnly}`;
      promises.push(
        queue.add(() =>
          executeChild(githubRepoSyncWorkflowV2, {
            workflowId: childWorkflowId,
            searchAttributes: {
              connectorId: [connectorId],
            },
            args: [
              {
                dataSourceConfig,
                connectorId,
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

/**
 * This workflow is used to sync the given repositories of a GitHub connector.
 * It's called v2 because we had to add it when there was already a workflow without the v2 to avoid non-deterministic errors.
 */
export async function githubReposSyncWorkflowV2(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  orgLogin: string,
  repos: { name: string; id: number }[]
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  for (const repo of repos) {
    const reposSyncWorkflowId = getReposSyncWorkflowId(connectorId);
    const childWorkflowId = `${reposSyncWorkflowId}-repo-${repo.id}`;
    promises.push(
      queue.add(() =>
        executeChild(githubRepoSyncWorkflowV2, {
          workflowId: childWorkflowId,
          searchAttributes: {
            connectorId: [connectorId],
          },
          args: [
            {
              dataSourceConfig,
              connectorId,
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

/**
 * This workflow is used to sync all the issues of a GitHub connector.
 * It's called v2 because we had to add it when there was already a workflow without the v2 to avoid non-deterministic errors.
 */
export async function githubRepoIssuesSyncWorkflowV2({
  dataSourceConfig,
  connectorId,
  repoName,
  repoId,
  repoLogin,
  pageNumber,
}: {
  dataSourceConfig: DataSourceConfig;
  connectorId: ModelId;
  repoName: string;
  repoId: number;
  repoLogin: string;
  pageNumber: number;
}): Promise<boolean> {
  // upserting the folder with all the issues
  await githubUpsertIssuesFolderActivity({ connectorId, repoId });

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
  });
  const promises: Promise<void>[] = [];

  const resultsPage = await githubGetRepoIssuesResultPageActivity(
    connectorId,
    repoName,
    repoLogin,
    pageNumber,
    { repoId }
  );

  if (!resultsPage.length) {
    return false;
  }

  for (const issueNumber of resultsPage) {
    promises.push(
      queue.add(() =>
        githubUpsertIssueActivity(
          connectorId,
          repoName,
          repoId,
          repoLogin,
          issueNumber,
          dataSourceConfig,
          {},
          true // isBatchSync
        )
      )
    );
  }

  await Promise.all(promises);

  return true;
}

/**
 * This workflow is used to sync all the discussions of a GitHub connector.
 * It's called v2 because we had to add it when there was already a workflow without the v2 to avoid non-deterministic errors.
 */
export async function githubRepoDiscussionsSyncWorkflowV2({
  dataSourceConfig,
  connectorId,
  repoName,
  repoId,
  repoLogin,
  nextCursor,
}: {
  dataSourceConfig: DataSourceConfig;
  connectorId: ModelId;
  repoName: string;
  repoId: number;
  repoLogin: string;
  nextCursor: string | null;
}): Promise<string | null> {
  // upserting the folder with all the discussions
  await githubUpsertDiscussionsFolderActivity({ connectorId, repoId });

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
  });
  const promises: Promise<void>[] = [];

  const { cursor, discussionNumbers } =
    await githubGetRepoDiscussionsResultPageActivity(
      connectorId,
      repoName,
      repoLogin,
      nextCursor,
      { repoId }
    );

  for (const discussionNumber of discussionNumbers) {
    promises.push(
      queue.add(() =>
        githubUpsertDiscussionActivity(
          connectorId,
          repoName,
          repoId,
          repoLogin,
          discussionNumber,
          dataSourceConfig,
          {},
          true // isBatchSync
        )
      )
    );
  }

  await Promise.all(promises);

  return cursor;
}

/**
 * This workflow is used to sync all the issues, discussions and code of a GitHub connector.
 * It's called v2 because we had to add it when there was already a workflow without the v2 to avoid non-deterministic errors.
 */
export async function githubRepoSyncWorkflowV2({
  dataSourceConfig,
  connectorId,
  repoName,
  repoId,
  repoLogin,
  syncCodeOnly,
  isFullSync,
  forceCodeResync = false,
}: {
  dataSourceConfig: DataSourceConfig;
  connectorId: ModelId;
  repoName: string;
  repoId: number;
  repoLogin: string;
  syncCodeOnly: boolean;
  isFullSync: boolean;
  forceCodeResync?: boolean;
}) {
  // upserting the root folder for the repository
  await githubUpsertRepositoryFolderActivity({ connectorId, repoId, repoName });

  if (!syncCodeOnly) {
    let pageNumber = 1; // 1-indexed
    for (;;) {
      const childWorkflowId = `${
        isFullSync
          ? getFullSyncWorkflowId(connectorId)
          : getReposSyncWorkflowId(connectorId)
      }-repo-${repoId}-issues-page-${pageNumber}`;

      const shouldContinue = await executeChild(
        githubRepoIssuesSyncWorkflowV2,
        {
          workflowId: childWorkflowId,
          searchAttributes: {
            connectorId: [connectorId],
          },
          args: [
            {
              dataSourceConfig,
              connectorId,
              repoName,
              repoId,
              repoLogin,
              pageNumber,
            },
          ],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          memo: workflowInfo().memo,
        }
      );

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
          ? getFullSyncWorkflowId(connectorId)
          : getReposSyncWorkflowId(connectorId)
      }-repo-${repoId}-issues-page-${cursorIteration}`;

      nextCursor = await executeChild(githubRepoDiscussionsSyncWorkflowV2, {
        workflowId: childWorkflowId,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [
          {
            dataSourceConfig,
            connectorId,
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
    connectorId,
    repoLogin,
    repoName,
    repoId,
    loggerArgs: { syncCodeOnly: syncCodeOnly ? "true" : "false" },
    isBatchSync: true,
    forceResync: forceCodeResync,
  });
}

export async function githubCodeSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoName: string,
  repoId: number,
  repoLogin: string
) {
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
      connectorId,
      repoLogin,
      repoName,
      repoId,
      loggerArgs: {
        debounceCount,
        activity: "githubCodeSync",
      },
      isBatchSync: true,
    });
    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

// This workflow simply signals `githubCodeSyncWorkflow` for repos that have `forceDailySync` set to
// true.
// This is used for repos that don't use pull requests, and thus don't have a webhook to trigger
// the sync.
export async function githubCodeSyncDailyCronWorkflow(
  connectorId: ModelId,
  repoName: string,
  repoId: number,
  repoLogin: string
) {
  await githubCodeSyncDailyCronActivity({
    connectorId,
    repoLogin,
    repoName,
    repoId,
  });
}

export async function githubIssueSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoName: string,
  repoId: number,
  repoLogin: string,
  issueNumber: number
) {
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
      connectorId,
      repoName,
      repoId,
      repoLogin,
      issueNumber,
      dataSourceConfig,
      { debounceCount }
    );
    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubDiscussionSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoName: string,
  repoId: number,
  repoLogin: string,
  discussionNumber: number
) {
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
      connectorId,
      repoName,
      repoId,
      repoLogin,
      discussionNumber,
      dataSourceConfig,
      { debounceCount },
      false // isBatchSync
    );

    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubIssueGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoId: string,
  issueNumber: number
) {
  await githubIssueGarbageCollectActivity(
    dataSourceConfig,
    connectorId,
    repoId,
    issueNumber
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubDiscussionGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoId: string,
  discussionNumber: number
) {
  await githubDiscussionGarbageCollectActivity(
    dataSourceConfig,
    connectorId,
    repoId,
    discussionNumber
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubRepoGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoId: string
) {
  await githubRepoGarbageCollectActivity(dataSourceConfig, connectorId, repoId);
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}
