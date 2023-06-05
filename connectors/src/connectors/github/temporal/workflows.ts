import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/github/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getFullSyncWorkflowId } from "./utils";

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
      const childWorkflowId = `${fullSyncWorkflowId}-repo-${repo.repoId}`;
      promises.push(
        queue.add(() =>
          executeChild(githubRepoSyncWorkflow.name, {
            workflowId: childWorkflowId,
            args: [
              dataSourceConfig,
              githubInstallationId,
              repo.repoId,
              repo.login,
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          })
        )
      );
    }
  }

  await Promise.all(promises);
}

export async function githubRepoSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoId: string,
  repoLogin: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId: githubInstallationId,
    repoId,
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
      repoId,
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
            repoId,
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
