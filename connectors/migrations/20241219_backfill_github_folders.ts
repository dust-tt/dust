import { makeScript } from "scripts/helpers";

import { getGithubCodeDirectoryParentIds } from "@connectors/connectors/github/lib/hierarchy";
import {
  getCodeRootInternalId,
  getDiscussionsInternalId,
  getIssuesInternalId,
  getRepositoryInternalId,
} from "@connectors/connectors/github/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import {
  GithubCodeDirectory,
  GithubCodeRepository,
  GithubConnectorState,
} from "@connectors/lib/models/github";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const FOLDER_CONCURRENCY = 10;

async function upsertFoldersForConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectorId = connector.id;

  const repositories = await GithubCodeRepository.findAll({
    where: { connectorId },
  });

  for (const repository of repositories) {
    const { repoId, repoName } = repository;
    const repoInternalId = getRepositoryInternalId(repoId);

    // folder for the repository
    if (execute) {
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: repoInternalId,
        parents: [repoInternalId],
        title: repoName,
        mimeType: "application/vnd.dust.github.repository",
      });
      logger.info(
        `Upserted repository folder ${repoInternalId} for ${repoName}`
      );
    } else {
      logger.info(
        `Would upsert repository folder ${repoInternalId} for ${repoName}`
      );
    }

    // folder with all the issues
    const issuesInternalId = getIssuesInternalId(repoId);
    if (execute) {
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: issuesInternalId,
        parents: [issuesInternalId, repoInternalId],
        title: "Issues",
        mimeType: "application/vnd.dust.github.issues",
      });
      logger.info(`Upserted issues folder ${issuesInternalId}`);
    } else {
      logger.info(`Would upsert issues folder ${issuesInternalId}`);
    }

    // folder with all the discussions
    const discussionsInternalId = getDiscussionsInternalId(repoId);
    if (execute) {
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: discussionsInternalId,
        parents: [discussionsInternalId, repoInternalId],
        title: "Discussions",
        mimeType: "application/vnd.dust.github.discussions",
      });
      logger.info(`Upserted discussions folder ${discussionsInternalId}`);
    } else {
      logger.info(`Would upsert discussions folder ${discussionsInternalId}`);
    }

    const connectorState = await GithubConnectorState.findOne({
      where: { connectorId },
    });
    if (connectorState?.codeSyncEnabled) {
      // folder for the code root
      const codeRootInternalId = getCodeRootInternalId(repoId);
      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: codeRootInternalId,
          title: "Code",
          parents: [codeRootInternalId, repoInternalId],
          mimeType: "application/vnd.dust.github.code.root",
        });
        logger.info(`Upserted code root folder ${codeRootInternalId}`);
      } else {
        logger.info(`Would upsert code root folder ${codeRootInternalId}`);
      }

      const directories = await GithubCodeDirectory.findAll({
        where: { connectorId },
      });

      // Upsert directories as folders
      await concurrentExecutor(
        directories,
        async (directory) => {
          const dirParents = await getGithubCodeDirectoryParentIds(
            connectorId,
            directory.internalId,
            parseInt(repoId, 10)
          );
          if (execute) {
            await upsertDataSourceFolder({
              dataSourceConfig,
              folderId: directory.internalId,
              parents: [directory.internalId, ...dirParents],
              title: directory.dirName,
              mimeType: "application/vnd.dust.github.code.directory",
            });
            logger.info(
              `Upserted directory folder ${directory.internalId} for ${directory.dirName}`
            );
          } else {
            logger.info(
              `Would upsert directory folder ${directory.internalId} for ${directory.dirName}`
            );
          }
        },
        { concurrency: FOLDER_CONCURRENCY }
      );
    }
  }
}
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("github", {});

  for (const connector of connectors) {
    logger.info(`Upserting folders for connector ${connector.id}`);
    await upsertFoldersForConnector(connector, execute, logger);
  }
});
