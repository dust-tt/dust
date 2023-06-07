import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/github/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getFullSyncWorkflowId, getReposSyncWorkflowId } from "./utils";

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
    githubInstallationId,
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
      const childWorkflowId = `${fullSyncWorkflowId}-repo-${repo.id}`;
      promises.push(
        queue.add(() =>
          executeChild(githubRepoSyncWorkflow.name, {
            workflowId: childWorkflowId,
            args: [
              dataSourceConfig,
              githubInstallationId,
              repo.name,
              repo.id,
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

export async function githubReposSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  orgLogin: string,
  repos: { name: string; id: number }[]
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  for (const repo of repos) {
    const reposSyncWorkflowId = getReposSyncWorkflowId(dataSourceConfig);
    const childWorkflowId = `${reposSyncWorkflowId}-repo-${repo.id}`;
    promises.push(
      queue.add(() =>
        executeChild(githubRepoSyncWorkflow.name, {
          workflowId: childWorkflowId,
          args: [
            dataSourceConfig,
            githubInstallationId,
            repo.name,
            repo.id,
            orgLogin,
          ],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        })
      )
    );
  }

  await Promise.all(promises);
}

export async function githubRepoSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
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

export async function githubIssueSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string,
  issueNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    repoName,
    repoLogin,
    issueNumber,
  };

  await githubUpsertIssueActivity(
    githubInstallationId,
    repoName,
    repoId,
    repoLogin,
    issueNumber,
    dataSourceConfig,
    loggerArgs
  );
}

export async function githubIssueGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string,
  issueNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    repoName,
    repoLogin,
    issueNumber,
  };

  // TODO: Implement
}

export async function githubRepoGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    repoName,
    repoLogin,
  };

  // todo: implement
}
