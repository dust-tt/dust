import { makeScript } from "scripts/helpers";

import { getGithubCodeDirectoryParentIds } from "@connectors/connectors/github/lib/hierarchy";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertFolderNode } from "@connectors/lib/data_sources";
import {
  GithubCodeDirectory,
  GithubCodeFile,
  GithubCodeRepository,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models/github";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

async function main() {
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
      // upsert directories as folders, in chunks
      for (let i = 0; i < directories.length; i += 16) {
        const chunk = directories.slice(i, i + 16);
        await Promise.all(
          chunk.map(async (directory) => {
            await upsertDirectoryFolderNode(
              directory,
              repository.id,
              dataSourceConfig
            );
          })
        );
      }
    }

    // Upsert issue folder if we have issues
    const repoWithDiscussions = await getUniqueRepositoryIdsWithIssues(
      connector.id
    );
    // Chunk and create issue nodes
    for (let i = 0; i < repoWithDiscussions.length; i += 16) {
      const chunk = repoWithDiscussions.slice(i, i + 16);
      await Promise.all(
        chunk.map(async (repoId) => {
          // The node id is the same as the repoId
          await upsertIssueFolderNode(repoId, `${repoId}`, dataSourceConfig);
        })
      );
    }

    // Upsert discussion folder if we have discussions
    const repoWithIssues = await getUniqueRepositoryIdsWithDiscussions(
      connector.id
    );
    // Chunk and create discussion nodes
    for (let i = 0; i < repoWithIssues.length; i += 16) {
      const chunk = repoWithIssues.slice(i, i + 16);
      await Promise.all(
        chunk.map(async (repoId) => {
          await upsertDiscussionFolderNode(
            repoId,
            // The node id is the same as the repoId
            `${repoId}`,
            dataSourceConfig
          );
        })
      );
    }
  }
}

async function upsertRepositoryFolderNode(
  repository: GithubCodeRepository,
  dataSourceConfig: DataSourceConfig
) {
  const repoFolderId = repository.repoId;
  await upsertFolderNode({
    dataSourceConfig,
    folderId: repoFolderId,
    parents: [repoFolderId],
    title: repository.repoName,
  });
  return repoFolderId;
}

async function upsertCodeFolderNode(
  repositoryId: string,
  repositoryNodeId: string,
  dataSourceConfig: DataSourceConfig
) {
  const codeFolderId = `github-code-${repositoryId}`;
  await upsertFolderNode({
    dataSourceConfig,
    folderId: codeFolderId,
    parents: [codeFolderId, repositoryNodeId],
    title: "Code",
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
  await upsertFolderNode({
    dataSourceConfig,
    folderId: directory.internalId,
    parents: [directory.internalId, ...parents],
    title: directory.dirName,
  });
}

async function upsertIssueFolderNode(
  repositoryId: string,
  repositoryNodeId: string,
  dataSourceConfig: DataSourceConfig
) {
  const issuesFolderId = `${repositoryId}-issues`;
  await upsertFolderNode({
    dataSourceConfig,
    folderId: issuesFolderId,
    parents: [issuesFolderId, repositoryNodeId],
    title: "Issues",
  });
}

async function upsertDiscussionFolderNode(
  repositoryId: string,
  repositoryNodeId: string,
  dataSourceConfig: DataSourceConfig
) {
  const discussionsFolderId = `${repositoryId}-discussions`;
  await upsertFolderNode({
    dataSourceConfig,
    folderId: discussionsFolderId,
    parents: [discussionsFolderId, repositoryNodeId],
    title: "Discussions",
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
    await main();
  }
});
