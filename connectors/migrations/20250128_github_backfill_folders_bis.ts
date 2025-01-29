import type { ModelId } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";
import type { Logger } from "pino";
import { makeScript } from "scripts/helpers";

import {
  githubGetReposResultPageActivity,
  githubUpsertDiscussionsFolderActivity,
  githubUpsertIssuesFolderActivity,
  githubUpsertRepositoryFolderActivity,
} from "@connectors/connectors/github/temporal/activities";
import { ConnectorResource } from "@connectors/resources/connector_resource";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("github", {});

  for (const connector of connectors) {
    await backfillMissingFolders(connector, logger, execute);
  }
});

async function backfillMissingFolders(
  connector: ConnectorResource,
  parentLogger: Logger,
  execute: boolean
) {
  const connectorId = connector.id;
  const logger = parentLogger.child({ connectorId, execute });
  logger.info("Backfilling folders");
  const repos = await getRepositories(connectorId);
  await concurrentExecutor(
    repos,
    async (repo) => {
      const repoId = repo.id;
      const repoName = repo.name;
      const repoLogin = repo.login;
      logger.info(
        { repoId, repoName, repoLogin },
        "Upserting repository folders"
      );
      if (execute) {
        await githubUpsertRepositoryFolderActivity({
          connectorId,
          repoId,
          repoName,
          repoLogin,
        });
        await githubUpsertIssuesFolderActivity({
          connectorId,
          repoId,
          repoLogin,
          repoName,
        });
        await githubUpsertDiscussionsFolderActivity({
          connectorId,
          repoId,
          repoLogin,
          repoName,
        });
      }
    },
    { concurrency: 4 }
  );
  logger.info("Finished backfilling folders");
}

async function getRepositories(connectorId: ModelId) {
  let pageNumber = 1; // 1-indexed
  const repos: {
    id: number;
    name: string;
    login: string;
  }[] = [];
  for (;;) {
    const resultsPage = await githubGetReposResultPageActivity(
      connectorId,
      pageNumber,
      { syncCodeOnly: "false" }
    );
    if (!resultsPage.length) {
      break;
    }
    pageNumber += 1;

    for (const repo of resultsPage) {
      repos.push({
        id: repo.id,
        name: repo.name,
        login: repo.login,
      });
    }
  }
  return repos;
}
