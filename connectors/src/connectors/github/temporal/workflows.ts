import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/github/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getFullSyncWorkflowId } from "./utils";

const { githubSaveStartSyncActivity, githubSaveSuccessSyncActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

const {
  githubGetReposResultPageActivity,
  githubGetRepoIssuesResultPageActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

const { githubUpsertIssueActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});

const MAX_CONCURRENT_REPO_SYNC_WORKFLOWS = 3;
const MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW = 3;

export async function githubFullSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string
) {
  await githubSaveStartSyncActivity(dataSourceConfig);

  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId: githubInstallationId,
  };

  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  let pageNumber = 1; // 1-indexed

  for (;;) {
    const resultsPage = await githubGetReposResultPageActivity(
      githubInstallationId,
      pageNumber,
      loggerArgs
    );
    if (!resultsPage.length) {
      break;
    }
    pageNumber += 1;

    for (const repo of resultsPage) {
      const fullSyncWorkflowId = getFullSyncWorkflowId(dataSourceConfig);
      const childWorkflowId = `${fullSyncWorkflowId}-repo-${repo.name}`;
      promises.push(
        queue.add(() =>
          executeChild(githubRepoSyncWorkflow.name, {
            workflowId: childWorkflowId,
            args: [
              dataSourceConfig,
              githubInstallationId,
              repo.name,
              repo.login,
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          })
        )
      );
    }
  }

  await Promise.all(promises);

  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubRepoSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoLogin: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId: githubInstallationId,
    repoName,
    repoLogin,
  };

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
  });
  const promises: Promise<void>[] = [];

  let pageNumber = 1; // 1-indexed
  for (;;) {
    const resultsPage = await githubGetRepoIssuesResultPageActivity(
      githubInstallationId,
      repoName,
      repoLogin,
      pageNumber,
      loggerArgs
    );
    if (!resultsPage.length) {
      break;
    }
    pageNumber += 1;
    for (const issueNumber of resultsPage) {
      promises.push(
        queue.add(() =>
          githubUpsertIssueActivity(
            githubInstallationId,
            repoName,
            repoLogin,
            issueNumber,
            dataSourceConfig,
            loggerArgs
          )
        )
      );
    }
  }

  await Promise.all(promises);
}
