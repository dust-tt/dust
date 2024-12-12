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

async function main() {
  const connectors = await ConnectorModel.findAll({
    where: {
      type: "github",
    },
  });

  for (const connector of connectors) {
    console.log(`Processing connector ${connector.id}...`);

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const repositories = await GithubCodeRepository.findAll({
      where: {
        connectorId: connector.id,
      },
    });

    for (const repository of repositories) {
      // upsert repository as folder
      const repoFolderId = repository.repoId;
      await upsertFolderNode({
        dataSourceConfig,
        folderId: repoFolderId,
        parents: [repoFolderId],
        title: repository.repoName,
      });

      // Upsert Code folder if we have some (file or directory)
      const hasCodeDirectory = await GithubCodeDirectory.findOne({
        where: {
          connectorId: connector.id,
          repoId: repository.repoId,
        },
      });
      const hasCodeFile = await GithubCodeFile.findOne({
        where: {
          connectorId: connector.id,
          repoId: repository.repoId,
        },
      });
      if (hasCodeDirectory || hasCodeFile) {
        const codeFolderId = `github-code-${repository.repoId}`;
        await upsertFolderNode({
          dataSourceConfig,
          folderId: codeFolderId,
          parents: [codeFolderId, repoFolderId],
          title: "Code",
        });
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
            // This already contains IDs for Code and Repository folders
            const parents = await getGithubCodeDirectoryParentIds(
              connector.id,
              directory.internalId,
              repository.id
            );
            await upsertFolderNode({
              dataSourceConfig,
              folderId: directory.internalId,
              parents: [directory.internalId, ...parents],
              title: directory.dirName,
            });
          })
        );
      }

      // Upsert issue folder if we have issues
      if (await GithubIssue.findOne({ where: { repoId: repository.repoId } })) {
        const issuesFolderId = `${repository.repoId}-issues`;
        await upsertFolderNode({
          dataSourceConfig,
          folderId: issuesFolderId,
          parents: [issuesFolderId, repoFolderId],
          title: "Issues",
        });
      }

      // Upsert discussion folder if we have discussions
      if (
        await GithubDiscussion.findOne({ where: { repoId: repository.repoId } })
      ) {
        const discussionsFolderId = `${repository.repoId}-discussions`;
        await upsertFolderNode({
          dataSourceConfig,
          folderId: discussionsFolderId,
          parents: [discussionsFolderId, repoFolderId],
          title: "Discussions",
        });
      }
    }
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
