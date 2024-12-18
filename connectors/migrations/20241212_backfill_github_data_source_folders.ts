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
  GithubCodeFile,
  GithubCodeRepository,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models/github";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

async function createFolderNodes() {
  const connectors = await ConnectorModel.findAll({
    where: {
      type: "github",
    },
  });

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
      const repoFolderId = await upsertRepositoryFolderNode(
        repository,
        dataSourceConfig
      );

      // Upsert Code folder if we have some (file or directory)
      const shouldCreateCodeFolder = await repositoryContainsCode(repository);
      if (shouldCreateCodeFolder) {
        await upsertCodeFolderNode(
          repository.repoId,
          repoFolderId,
          dataSourceConfig
        );
      }

      const directories = await GithubCodeDirectory.findAll({
        where: {
          connectorId: connector.id,
        },
      });
      // Upsert directories as folders, in chunks
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

    // Upsert issues folder if we have some
    const repoWithIssues = await getUniqueRepositoryIdsWithIssues(connector.id);
    await concurrentExecutor(
      repoWithIssues,
      async (repoId) => {
        // The node id is the same as the repoId
        await upsertIssueFolderNode(
          repoId,
          getRepositoryInternalId(repoId),
          dataSourceConfig
        );
      },
      { concurrency: 16 }
    );

    // Upsert discussions folder if we have some
    const repoWithDiscussions = await getUniqueRepositoryIdsWithDiscussions(
      connector.id
    );
    await concurrentExecutor(
      repoWithDiscussions,
      async (repoId) => {
        // The node id is the same as the repoId
        await upsertDiscussionFolderNode(
          repoId,
          getRepositoryInternalId(repoId),
          dataSourceConfig
        );
      },
      { concurrency: 16 }
    );
  }
}

async function upsertRepositoryFolderNode(
  repository: GithubCodeRepository,
  dataSourceConfig: DataSourceConfig
) {
  const repoFolderId = repository.repoId;
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: getRepositoryInternalId(repository.repoId),
    parents: [repoFolderId],
    title: repository.repoName,
    mimeType: getMimeTypeFromGithubContentNodeType("REPO_FULL"),
  });
  return repoFolderId;
}

async function upsertCodeFolderNode(
  repositoryId: string,
  repositoryNodeId: string,
  dataSourceConfig: DataSourceConfig
) {
  const codeFolderId = getCodeRootInternalId(repositoryId);
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: codeFolderId,
    parents: [codeFolderId, repositoryNodeId],
    title: "Code",
    mimeType: getMimeTypeFromGithubContentNodeType("REPO_CODE"),
  });
  return codeFolderId;
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

async function repositoryContainsCode(repository: GithubCodeRepository) {
  const directory = await GithubCodeDirectory.findOne({
    where: {
      connectorId: repository.connectorId,
      repoId: repository.repoId,
    },
  });
  if (directory) {
    return true;
  }
  const file = await GithubCodeFile.findOne({
    where: {
      connectorId: repository.connectorId,
      repoId: repository.repoId,
    },
  });
  return !!file;
}

async function getUniqueRepositoryIdsWithIssues(connectorId: number) {
  const repoIds = await GithubIssue.findAll({
    where: {
      connectorId: connectorId,
    },
    attributes: ["repoId"],
    group: ["repoId"],
  });
  return repoIds.map((repoId) => repoId.repoId);
}

async function getUniqueRepositoryIdsWithDiscussions(connectorId: number) {
  const repoIds = await GithubDiscussion.findAll({
    where: {
      connectorId: connectorId,
    },
    attributes: ["repoId"],
    group: ["repoId"],
  });
  return repoIds.map((repoId) => repoId.repoId);
}

makeScript({}, async ({ execute }) => {
  if (execute) {
    await createFolderNodes();
  }
});
