import { makeScript } from "scripts/helpers";

import { getGithubCodeDirectoryParentIds } from "@connectors/connectors/github/lib/hierarchy";
import {
  getCodeRootInternalId,
  getDiscussionsInternalId,
  getIssuesInternalId,
  getMimeTypeFromGithubContentNodeType,
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
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

async function createFolderNodes() {
  const connectors = await ConnectorResource.listByType("github", {});

  for (const connector of connectors) {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const repositories = await GithubCodeRepository.findAll({
      where: {
        connectorId: connector.id,
      },
    });

    for (const repository of repositories) {
      // upsert repository as folder
      // Throws if error
      await upsertRepositoryFolderNode(repository, dataSourceConfig);

      // Upsert discussions folder
      await upsertDiscussionFolderNode(
        repository.repoId,
        getRepositoryInternalId(repository.repoId),
        dataSourceConfig
      );

      // Upsert issues folder
      await upsertIssueFolderNode(
        repository.repoId,
        getRepositoryInternalId(repository.repoId),
        dataSourceConfig
      );

      const connectorState = await GithubConnectorState.findOne({
        where: {
          connectorId: connector.id,
        },
      });
      // Skip Directories and Code creation if code sync is disabled
      if (!connectorState?.codeSyncEnabled) {
        continue;
      }

      // Upsert Code folder
      await upsertCodeFolderNode(repository.repoId, dataSourceConfig);

      const directories = await GithubCodeDirectory.findAll({
        where: {
          connectorId: connector.id,
        },
      });
      // Upsert directories as folders
      await concurrentExecutor(
        directories,
        async (directory) => {
          await upsertDirectoryFolderNode(
            directory,
            repository.id,
            dataSourceConfig
          );
        },
        { concurrency: 16 }
      );
    }
  }
}

async function upsertRepositoryFolderNode(
  repository: GithubCodeRepository,
  dataSourceConfig: DataSourceConfig
) {
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: getRepositoryInternalId(repository.repoId),
    parents: [getRepositoryInternalId(repository.repoId)],
    title: repository.repoName,
    mimeType: getMimeTypeFromGithubContentNodeType("REPO_FULL"),
  });
}

async function upsertCodeFolderNode(
  repositoryId: string,
  dataSourceConfig: DataSourceConfig
) {
  const codeFolderId = getCodeRootInternalId(repositoryId);
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: codeFolderId,
    parents: [codeFolderId, getRepositoryInternalId(repositoryId)],
    title: "Code",
    mimeType: getMimeTypeFromGithubContentNodeType("REPO_CODE"),
  });
}

async function upsertDirectoryFolderNode(
  directory: GithubCodeDirectory,
  repositoryId: number,
  dataSourceConfig: DataSourceConfig
) {
  // This already contains IDs for Code and Repository folders
  const parents = await getGithubCodeDirectoryParentIds(
    directory.connectorId,
    directory.internalId,
    repositoryId
  );
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: directory.internalId,
    parents: [directory.internalId, ...parents],
    title: directory.dirName,
    mimeType: getMimeTypeFromGithubContentNodeType("REPO_CODE_DIR"),
  });
}

async function upsertIssueFolderNode(
  repositoryId: string,
  repositoryNodeId: string,
  dataSourceConfig: DataSourceConfig
) {
  const issuesFolderId = getIssuesInternalId(repositoryId);
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: issuesFolderId,
    parents: [issuesFolderId, repositoryNodeId],
    title: "Issues",
    mimeType: getMimeTypeFromGithubContentNodeType("REPO_ISSUES"),
  });
}

async function upsertDiscussionFolderNode(
  repositoryId: string,
  repositoryNodeId: string,
  dataSourceConfig: DataSourceConfig
) {
  const discussionsFolderId = getDiscussionsInternalId(repositoryId);
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: discussionsFolderId,
    parents: [discussionsFolderId, repositoryNodeId],
    title: "Discussions",
    mimeType: getMimeTypeFromGithubContentNodeType("REPO_DISCUSSIONS"),
  });
}

makeScript({}, async ({ execute }) => {
  if (execute) {
    await createFolderNodes();
  }
});
