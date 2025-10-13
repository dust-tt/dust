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
import type * as activitiesSyncCode from "@connectors/connectors/github/temporal/activities/sync_code";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";

import { newWebhookSignal } from "./signals";
import {
  getCodeSyncStatelessWorkflowId,
  getFullSyncWorkflowId,
  getReposSyncWorkflowId,
  getRepoSyncWorkflowId,
} from "./utils";

const {
  githubSaveStartSyncActivity,
  githubSaveSuccessSyncActivity,
  githubCodeSyncDailyCronActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

const {
  githubGetReposResultPageActivity,
  githubGetRepoDiscussionsResultPageActivity,
  githubIssueGarbageCollectActivity,
  githubDiscussionGarbageCollectActivity,
  githubUpsertDiscussionsFolderActivity,
  githubUpsertIssuesFolderActivity,
  githubUpsertRepositoryFolderActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

const {
  githubGetRepoIssuesResultPageActivity,
  githubRepoGarbageCollectActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minute",
});

const { githubUpsertIssueActivity, githubUpsertDiscussionActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minute",
  });

const { githubEnsureCodeSyncEnabledActivity } = proxyActivities<
  typeof activitiesSyncCode
>({
  startToCloseTimeout: "10 minute",
});

const {
  githubCleanupCodeSyncActivity,
  githubCreateGcsIndexActivity,
  githubProcessIndexFileActivity,
} = proxyActivities<typeof activitiesSyncCode>({
  startToCloseTimeout: "30 minute",
});

const { githubExtractToGcsActivity } = proxyActivities<
  typeof activitiesSyncCode
>({
  startToCloseTimeout: "120 minute",
});

const MAX_CONCURRENT_REPO_SYNC_WORKFLOWS = 3;
const MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW = 8;

/**
 * This workflow is used to fetch and sync all the repositories of a GitHub connector.
 */
export async function githubFullSyncWorkflow(
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
          executeChild(githubRepoSyncWorkflow, {
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
 */
export async function githubReposSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  orgLogin: string,
  repos: { name: string; id: number }[]
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  for (const repo of repos) {
    const childWorkflowId = getRepoSyncWorkflowId(connectorId, repo.id);
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
 */
export async function githubRepoIssuesSyncWorkflow({
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
  await githubUpsertIssuesFolderActivity({
    connectorId,
    repoId,
    repoLogin,
    repoName,
  });

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
 */
export async function githubRepoDiscussionsSyncWorkflow({
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
  await githubUpsertDiscussionsFolderActivity({
    connectorId,
    repoId,
    repoLogin,
    repoName,
  });

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
  });
  const promises: Promise<void>[] = [];

  const result = await githubGetRepoDiscussionsResultPageActivity(
    connectorId,
    repoName,
    repoLogin,
    nextCursor,
    { repoId }
  );

  if (!result) {
    // Repository not found, skip
    return null;
  }

  const { cursor, discussionNumbers } = result;

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
 */
export async function githubRepoSyncWorkflow({
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
  await githubUpsertRepositoryFolderActivity({
    connectorId,
    repoId,
    repoName,
    repoLogin,
  });

  if (!syncCodeOnly) {
    let pageNumber = 1; // 1-indexed
    for (;;) {
      const childWorkflowId = `${
        isFullSync
          ? getFullSyncWorkflowId(connectorId)
          : getReposSyncWorkflowId(connectorId)
      }-repo-${repoId}-issues-page-${pageNumber}`;

      const shouldContinue = await executeChild(githubRepoIssuesSyncWorkflow, {
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
          ? getFullSyncWorkflowId(connectorId)
          : getReposSyncWorkflowId(connectorId)
      }-repo-${repoId}-issues-page-${cursorIteration}`;

      nextCursor = await executeChild(githubRepoDiscussionsSyncWorkflow, {
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

  await executeChild(githubCodeSyncStatelessWorkflow, {
    workflowId: getCodeSyncStatelessWorkflowId(connectorId, repoId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    args: [
      {
        connectorId,
        dataSourceConfig,
        forceResync: forceCodeResync,
        repoId,
        repoLogin,
        repoName,
      },
    ],
    memo: workflowInfo().memo,
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
      continue;
    }

    await executeChild(githubCodeSyncStatelessWorkflow, {
      workflowId: getCodeSyncStatelessWorkflowId(connectorId, repoId),
      searchAttributes: {
        connectorId: [connectorId],
      },
      args: [
        {
          connectorId,
          dataSourceConfig,
          repoId,
          repoLogin,
          repoName,
        },
      ],
      memo: workflowInfo().memo,
    });
  }
}

export async function githubCodeSyncStatelessWorkflow({
  connectorId,
  dataSourceConfig,
  repoId,
  repoLogin,
  repoName,
  forceResync = false,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  repoId: number;
  repoLogin: string;
  repoName: string;
  forceResync?: boolean;
}) {
  const codeSyncStartedAtMs = Date.now();

  const shouldSyncCode = await githubEnsureCodeSyncEnabledActivity({
    codeSyncStartedAtMs,
    connectorId,
    dataSourceConfig,
    repoId,
    repoLogin,
    repoName,
  });

  if (!shouldSyncCode) {
    return;
  }

  // upserting the root folder for the repository
  await githubUpsertRepositoryFolderActivity({
    connectorId,
    repoId,
    repoName,
    repoLogin,
  });

  // First, get the tar file from the GitHub API and upload it to GCS.
  const extractResult = await githubExtractToGcsActivity({
    connectorId,
    dataSourceConfig,
    repoId,
    repoLogin,
    repoName,
  });

  // If the repo is too large, we don't want to try to sync the code.
  if (!extractResult) {
    return;
  }

  // Create multiple index files containing all file paths to optimize memory usage.
  const indexResult = await githubCreateGcsIndexActivity({
    connectorId,
    gcsBasePath: extractResult.gcsBasePath,
    repoId,
    repoLogin,
    repoName,
  });

  const allUpdatedDirectoryIds = new Set<string>();

  // Process each index file in parallel (one activity per index file).
  const indexFilePromises = indexResult.indexPaths.map((indexPath) =>
    githubProcessIndexFileActivity({
      codeSyncStartedAtMs,
      connectorId,
      dataSourceConfig,
      defaultBranch: extractResult.repoInfo.default_branch,
      forceResync,
      gcsBasePath: extractResult.gcsBasePath,
      indexPath,
      isBatchSync: true,
      repoId,
      repoLogin,
      repoName,
    })
  );

  // Wait for all index files to be processed and collect updated directory IDs.
  const indexResults = await Promise.all(indexFilePromises);
  for (const result of indexResults) {
    for (const dirId of result.updatedDirectoryIds) {
      allUpdatedDirectoryIds.add(dirId);
    }
  }

  await githubCleanupCodeSyncActivity({
    connectorId,
    repoId,
    dataSourceConfig,
    codeSyncStartedAtMs,
    repoUpdatedAt: allUpdatedDirectoryIds.size > 0 ? new Date() : undefined,
  });

  await githubSaveSuccessSyncActivity(dataSourceConfig);
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

    // upserting the root folder for the repository
    await githubUpsertRepositoryFolderActivity({
      connectorId,
      repoId,
      repoName,
      repoLogin,
    });

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

    // upserting the root folder for the repository
    await githubUpsertRepositoryFolderActivity({
      connectorId,
      repoId,
      repoName,
      repoLogin,
    });

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
