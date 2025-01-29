import {
  getDiscussionsInternalId,
  getIssuesInternalId,
  getRepositoryInternalId,
  matchGithubInternalIdType,
} from "@connectors/connectors/github/lib/utils";
import { GithubDiscussion, GithubIssue } from "@connectors/lib/models/github";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ModelId } from "@dust-tt/types";
import { Logger } from "pino";
import { makeScript } from "scripts/helpers";
import { Sequelize } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("github", {});

  for (const connector of connectors) {
    await backfillMissingFolders(connector, logger);
  }
});

async function backfillMissingFolders(
  connector: ConnectorResource,
  parentLogger: Logger
) {
  const connectorId = connector.id;
  const logger = parentLogger.child({ connectorId });
  const repoIds = await getRepositoryIds(connectorId, logger);
  const internalIdsToCheck = repoIds
    .map((repoId) => [
      getRepositoryInternalId(repoId),
      getDiscussionsInternalId(repoId),
      getIssuesInternalId(repoId),
    ])
    .flat();
  const idsNotInCore = await getFoldersNotInCore(internalIdsToCheck, logger);
  for (const id of idsNotInCore) {
    const { type, repoId } = matchGithubInternalIdType(id);
    switch (type) {
      case "REPO_FULL":
        break;
      case "REPO_ISSUES":
        break;
      case "REPO_DISCUSSIONS":
        break;
      default:
        throw new Error(`Unexpected type: ${type}`);
    }
  }
}

async function getRepositoryIds(connectorId: ModelId, logger: Logger) {
  const discussionRepos = await GithubDiscussion.findAll({
    where: { connectorId: connectorId },
    attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("repoId")), "repoId"]],
  });
  const issuesRepos = await GithubIssue.findAll({
    where: { connectorId: connectorId },
    attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("repoId")), "repoId"]],
  });
  const repositoryIds = [
    ...new Set([
      ...discussionRepos.map((repository) => repository.repoId),
      ...issuesRepos.map((repository) => repository.repoId),
    ]),
  ];
  logger.info(
    { repositoryIds },
    `Found ${repositoryIds.length} repository ids`
  );
  return repositoryIds;
}
