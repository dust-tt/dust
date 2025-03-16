import type { Logger } from "pino";
import { makeScript } from "scripts/helpers";

import {
  githubGetReposResultPageActivity,
  githubUpsertDiscussionsFolderActivity,
  githubUpsertIssuesFolderActivity,
  githubUpsertRepositoryFolderActivity,
} from "@connectors/connectors/github/temporal/activities";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

makeScript(
  {
    startId: { type: "number", demandOption: false },
  },
  async ({ execute, startId }, logger) => {
    logger.info("Starting backfill");
    const connectors = await ConnectorResource.listByType("github", {});
    // sort connectors by id
    connectors.sort((a, b) => a.id - b.id);
    // start from startId if provided
    const startIndex = startId
      ? connectors.findIndex((c) => c.id === startId)
      : 0;
    if (startIndex === -1) {
      throw new Error(`Connector with id ${startId} not found`);
    }
    const slicedConnectors = connectors.slice(startIndex);
    for (const connector of slicedConnectors) {
      await backfillMissingFolders(connector, logger, execute);
    }
  }
);

async function backfillMissingFolders(
  connector: ConnectorResource,
  parentLogger: Logger,
  execute: boolean
) {
  const connectorId = connector.id;
  const logger = parentLogger.child({ connectorId, execute });
  logger.info("Backfilling folders");
  let repos: {
    id: number;
    name: string;
    login: string;
  }[] = [];
  try {
    repos = await getRepositories(connectorId);
  } catch (error) {
    logger.error(
      error,
      "Error getting repositories for connector, skipping this connector"
    );
    return;
  }
  for (const repo of repos) {
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
  }
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
