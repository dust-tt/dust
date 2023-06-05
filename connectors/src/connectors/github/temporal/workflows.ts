import { proxyActivities } from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/github/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const { getReposResultPage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
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
    const resultsPage = await getReposResultPage(
      githubInstallationId,
      pageNumber,
      loggerArgs
    );
    if (!resultsPage.length) {
      break;
    }
    pageNumber += 1;

    for (const repo of resultsPage) {
      // enqueue child workflow promise to sync it
    }
  }

  await Promise.all(promises);
}

export async function githubRepoSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoLogin: string
) {
  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
  });
  const promises: Promise<void>[] = [];

  for (;;) {
    // get issues page
    // for each issue, enqueue an activity promise to sync it
    // if there is a next page, continue
    // else break

    break;
  }

  await Promise.all(promises);
}
