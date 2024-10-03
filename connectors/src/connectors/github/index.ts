import type { ConnectorsAPIError, ContentNode, Result } from "@dust-tt/types";
import type { ConnectorPermission, ContentNodesViewType } from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";

import type { GithubRepo } from "@connectors/connectors/github/lib/github_api";
import {
  getRepo,
  getReposPage,
  installationIdFromConnectionId,
} from "@connectors/connectors/github/lib/github_api";
import { getGithubCodeOrDirectoryParentIds } from "@connectors/connectors/github/lib/hierarchy";
import { matchGithubInternalIdType } from "@connectors/connectors/github/lib/utils";
import { launchGithubFullSyncWorkflow } from "@connectors/connectors/github/temporal/client";
import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  GithubCodeDirectory,
  GithubCodeFile,
  GithubCodeRepository,
  GithubConnectorState,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models/github";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({ provider: "github" });

export class GithubConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError>> {
    const installationId = await installationIdFromConnectionId(connectionId);
    if (!installationId) {
      throw new Error("Github: received connectionId is invalid");
    }

    const githubConfigurationBlob = {
      webhooksEnabledAt: new Date(),
      codeSyncEnabled: false,
      installationId,
    };

    const connector = await ConnectorResource.makeNew(
      "github",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      githubConfigurationBlob
    );

    await launchGithubFullSyncWorkflow({
      connectorId: connector.id,
      syncCodeOnly: false,
    });
    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorsAPIError>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err({
        message: "Connector not found",
        type: "connector_not_found",
      });
    }

    if (connectionId) {
      const [oldGithubInstallationId, newGithubInstallationId] =
        await Promise.all([
          installationIdFromConnectionId(c.connectionId),
          installationIdFromConnectionId(connectionId),
        ]);

      if (oldGithubInstallationId !== newGithubInstallationId) {
        return new Err({
          type: "connector_oauth_target_mismatch",
          message: "Cannot change the Installation Id of a Github Data Source",
        });
      }

      await c.update({ connectionId });

      await launchGithubFullSyncWorkflow({
        connectorId: this.connectorId,
        syncCodeOnly: false,
      });
    }

    return new Ok(c.id.toString());
  }

  async stop(): Promise<Result<undefined, Error>> {
    try {
      const connector = await ConnectorResource.fetchById(this.connectorId);

      if (!connector) {
        return new Err(new Error("Connector not found"));
      }

      const connectorState = await GithubConnectorState.findOne({
        where: {
          connectorId: connector.id,
        },
      });

      if (!connectorState) {
        return new Err(new Error("Connector state not found"));
      }

      await connectorState.update({
        webhooksEnabledAt: null,
      });

      await terminateAllWorkflowsForConnectorId(this.connectorId);

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Github connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    try {
      const connector = await ConnectorResource.fetchById(this.connectorId);

      if (!connector) {
        return new Err(new Error("Connector not found"));
      }

      const connectorState = await GithubConnectorState.findOne({
        where: {
          connectorId: connector.id,
        },
      });

      if (!connectorState) {
        return new Err(new Error("Connector state not found"));
      }

      if (connectorState.webhooksEnabledAt) {
        return new Err(new Error("Connector is not stopped"));
      }

      await connectorState.update({
        webhooksEnabledAt: new Date(),
      });

      await launchGithubFullSyncWorkflow({
        connectorId: connector.id,
        syncCodeOnly: false,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    if (fromTs) {
      return new Err(
        new Error("Github connector does not support partial resync")
      );
    }

    try {
      await launchGithubFullSyncWorkflow({
        connectorId: this.connectorId,
        syncCodeOnly: false,
      });
      return new Ok(this.connectorId.toString());
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async retrievePermissions({
    parentInternalId,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }

    const connectionId = c.connectionId;

    if (!parentInternalId) {
      // No parentInternalId: we return the repositories.

      let nodes: ContentNode[] = [];
      let pageNumber = 1; // 1-indexed
      for (;;) {
        const pageRes = await getReposPage(connectionId, pageNumber);

        if (pageRes.isErr()) {
          return new Err(pageRes.error);
        }

        const page = pageRes.value;
        pageNumber += 1;
        if (page.length === 0) {
          break;
        }

        nodes = nodes.concat(
          page.map((repo) => ({
            provider: c.type,
            internalId: repo.id.toString(),
            parentInternalId: null,
            type: "folder",
            title: repo.name,
            sourceUrl: repo.url,
            expandable: true,
            permission: "read",
            dustDocumentId: null,
            lastUpdatedAt: null,
          }))
        );
      }

      nodes.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(nodes);
    } else {
      if (parentInternalId.startsWith("github-code-")) {
        const [files, directories] = await Promise.all([
          (async () => {
            return GithubCodeFile.findAll({
              where: {
                connectorId: c.id,
                parentInternalId,
              },
            });
          })(),
          (async () => {
            return GithubCodeDirectory.findAll({
              where: {
                connectorId: c.id,
                parentInternalId,
              },
            });
          })(),
        ]);

        files.sort((a, b) => {
          return a.fileName.localeCompare(b.fileName);
        });
        directories.sort((a, b) => {
          return a.dirName.localeCompare(b.dirName);
        });

        const nodes: ContentNode[] = [];

        directories.forEach((directory) => {
          nodes.push({
            provider: c.type,
            internalId: directory.internalId,
            parentInternalId,
            type: "folder",
            title: directory.dirName,
            sourceUrl: directory.sourceUrl,
            expandable: true,
            permission: "read",
            dustDocumentId: null,
            lastUpdatedAt: directory.codeUpdatedAt.getTime(),
          });
        });

        files.forEach((file) => {
          nodes.push({
            provider: c.type,
            internalId: file.documentId,
            parentInternalId,
            type: "file",
            title: file.fileName,
            sourceUrl: file.sourceUrl,
            expandable: false,
            permission: "read",
            dustDocumentId: file.documentId,
            lastUpdatedAt: file.codeUpdatedAt.getTime(),
          });
        });

        return new Ok(nodes);
      } else {
        // If parentInternalId is set and does not start with `github-code` it means that it is
        // supposed to be the repoId. We support issues and discussions and also want to add the code
        // repo resource if it exists (code sync enabled).
        const repoId = parseInt(parentInternalId, 10);
        if (isNaN(repoId)) {
          return new Err(new Error(`Invalid repoId: ${parentInternalId}`));
        }

        const [latestDiscussion, latestIssue, repo, codeRepo] =
          await Promise.all([
            (async () => {
              return GithubDiscussion.findOne({
                where: {
                  connectorId: c.id,
                  repoId: repoId.toString(),
                },
                limit: 1,
                order: [["updatedAt", "DESC"]],
              });
            })(),
            (async () => {
              return GithubIssue.findOne({
                where: {
                  connectorId: c.id,
                  repoId: repoId.toString(),
                },
                limit: 1,
                order: [["updatedAt", "DESC"]],
              });
            })(),
            getRepo(connectionId, repoId),
            (async () => {
              return GithubCodeRepository.findOne({
                where: {
                  connectorId: c.id,
                  repoId: repoId.toString(),
                },
              });
            })(),
          ]);

        const nodes: ContentNode[] = [];

        if (latestIssue) {
          nodes.push({
            provider: c.type,
            internalId: `${repoId}-issues`,
            parentInternalId,
            type: "database",
            title: "Issues",
            sourceUrl: repo.url + "/issues",
            expandable: false,
            permission: "read",
            dustDocumentId: null,
            lastUpdatedAt: latestIssue.updatedAt.getTime(),
          });
        }

        if (latestDiscussion) {
          nodes.push({
            provider: c.type,
            internalId: `${repoId}-discussions`,
            parentInternalId,
            type: "channel",
            title: "Discussions",
            sourceUrl: repo.url + "/discussions",
            expandable: false,
            permission: "read",
            dustDocumentId: null,
            lastUpdatedAt: latestDiscussion.updatedAt.getTime(),
          });
        }

        if (codeRepo) {
          nodes.push({
            provider: c.type,
            internalId: `github-code-${repoId}`,
            parentInternalId,
            type: "folder",
            title: "Code",
            sourceUrl: repo.url,
            expandable: true,
            permission: "read",
            dustDocumentId: null,
            lastUpdatedAt: codeRepo.codeUpdatedAt.getTime(),
          });
        }

        return new Ok(nodes);
      }
    }
  }

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }

    const connectionId = c.connectionId;
    const allReposIdsToFetch: Set<number> = new Set();
    const nodes: ContentNode[] = [];

    // Users can select:
    // A full repo (issues + discussions + code if enabled)
    const fullRepoIds: number[] = [];

    //  All issues of the repo, or all discussions of the repo
    const allIssuesFromRepoIds: number[] = [];
    const allDiscussionsFromRepoIds: number[] = [];

    // The full code, or a specific folder or file in the code
    const allCodeFromRepoIds: string[] = [];
    const codeDirectoryIds: string[] = [];
    const codeFileIds: string[] = [];

    // We loop on all the internalIds we receive to know what is the related data type
    internalIds.forEach((internalId) => {
      const { type, repoId } = matchGithubInternalIdType(internalId);
      allReposIdsToFetch.add(repoId);

      switch (type) {
        case "REPO_FULL":
          fullRepoIds.push(repoId);
          break;
        case "REPO_ISSUES":
          allIssuesFromRepoIds.push(repoId);
          break;
        case "REPO_DISCUSSIONS":
          allDiscussionsFromRepoIds.push(repoId);
          break;
        case "REPO_CODE":
          allCodeFromRepoIds.push(repoId.toString());
          break;
        case "REPO_CODE_DIR":
          codeDirectoryIds.push(internalId);
          break;
        case "REPO_CODE_FILE":
          codeFileIds.push(internalId);
          break;
        default:
          assertNever(type);
      }
    });

    // Repos are not stored in the DB, we have to fetch them from the API
    const uniqueRepoIdsArray: number[] = Array.from(allReposIdsToFetch);
    const uniqueRepos: Record<number, GithubRepo> = {};
    await concurrentExecutor(
      uniqueRepoIdsArray,
      async (repoId) => {
        const repoData = await getRepo(connectionId, repoId);
        uniqueRepos[repoId] = repoData;
      },
      { concurrency: 8 }
    );

    // Code Repositories, Directories and Files are stored in the DB
    const [fullCodeInRepos, codeDirectories, codeFiles] = await Promise.all([
      GithubCodeRepository.findAll({
        where: {
          connectorId: c.id,
          repoId: allCodeFromRepoIds,
        },
      }),
      GithubCodeDirectory.findAll({
        where: {
          connectorId: c.id,
          internalId: codeDirectoryIds,
        },
      }),
      GithubCodeFile.findAll({
        where: {
          connectorId: c.id,
          documentId: codeFileIds,
        },
      }),
    ]);

    // Constructing Nodes for Full Repo
    fullRepoIds.forEach((repoId) => {
      const repo = uniqueRepos[repoId];
      if (!repo) {
        return;
      }
      nodes.push({
        provider: c.type,
        internalId: repoId.toString(),
        parentInternalId: null,
        type: "folder",
        title: repo.name,
        titleWithParentsContext: `[${repo.name}] - Full repository`,
        sourceUrl: repo.url,
        expandable: true,
        permission: "read",
        dustDocumentId: null,
        lastUpdatedAt: null,
      });
    });

    // Constructing Nodes for All Issues and All Discussions
    allIssuesFromRepoIds.forEach((repoId) => {
      const repo = uniqueRepos[repoId];
      if (!repo) {
        return;
      }
      nodes.push({
        provider: c.type,
        internalId: `${repoId}-issues`,
        parentInternalId: repoId.toString(),
        type: "database",
        title: "Issues",
        titleWithParentsContext: `[${repo.name}] Issues`,
        sourceUrl: repo.url + "/issues",
        expandable: false,
        permission: "read",
        dustDocumentId: null,
        lastUpdatedAt: null,
      });
    });
    allDiscussionsFromRepoIds.forEach((repoId) => {
      const repo = uniqueRepos[repoId];
      if (!repo) {
        return;
      }
      nodes.push({
        provider: c.type,
        internalId: `${repoId}-discussions`,
        parentInternalId: repoId.toString(),
        type: "channel",
        title: "Discussions",
        titleWithParentsContext: `[${repo.name}] Discussions`,
        sourceUrl: repo.url + "/discussions",
        expandable: false,
        permission: "read",
        dustDocumentId: null,
        lastUpdatedAt: null,
      });
    });

    // Constructing Nodes for Code
    fullCodeInRepos.forEach((codeRepo) => {
      const repo = uniqueRepos[parseInt(codeRepo.repoId)];
      nodes.push({
        provider: c.type,
        internalId: `github-code-${codeRepo.repoId}`,
        parentInternalId: codeRepo.repoId,
        type: "folder",
        title: "Code",
        titleWithParentsContext: repo ? `[${repo.name}] Code` : "Code",
        sourceUrl: codeRepo.sourceUrl,
        expandable: true,
        permission: "read",
        dustDocumentId: null,
        lastUpdatedAt: codeRepo.codeUpdatedAt.getTime(),
      });
    });

    // Constructing Nodes for Code Directories
    codeDirectories.forEach((directory) => {
      const repo = uniqueRepos[parseInt(directory.repoId)];
      nodes.push({
        provider: c.type,
        internalId: directory.internalId,
        parentInternalId: directory.parentInternalId,
        type: "folder",
        title: directory.dirName,
        titleWithParentsContext: repo
          ? `[${repo.name}] ${directory.dirName} (code)`
          : directory.dirName,
        sourceUrl: directory.sourceUrl,
        expandable: true,
        permission: "read",
        dustDocumentId: null,
        lastUpdatedAt: directory.codeUpdatedAt.getTime(),
      });
    });

    // Constructing Nodes for Code Files
    codeFiles.forEach((file) => {
      const repo = uniqueRepos[parseInt(file.repoId)];
      nodes.push({
        provider: c.type,
        internalId: file.documentId,
        parentInternalId: file.parentInternalId,
        type: "file",
        title: file.fileName,
        titleWithParentsContext: repo
          ? `[${repo.name}] ${file.fileName} (code)`
          : file.fileName,
        sourceUrl: file.sourceUrl,
        expandable: false,
        permission: "read",
        dustDocumentId: file.documentId,
        lastUpdatedAt: file.codeUpdatedAt.getTime(),
      });
    });

    return new Ok(nodes);
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    const baseParents: string[] = [internalId];

    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    if (internalId.startsWith(`github-code-`)) {
      const repoId = parseInt(internalId.split("-")[2] || "", 10);
      if (internalId.split("-").length > 3) {
        const parents = await getGithubCodeOrDirectoryParentIds(
          connector.id,
          internalId,
          repoId
        );
        return new Ok([...baseParents, ...parents]);
      } else {
        return new Ok([...baseParents, `${repoId}`]);
      }
    } else {
      const repoId = parseInt(internalId.split("-")[0] || "", 10);
      if (
        internalId.endsWith("-issues") ||
        internalId.endsWith("-discussions")
      ) {
        return new Ok([...baseParents, `${repoId}`]);
      }
      return new Ok(baseParents);
    }
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    switch (configKey) {
      case "codeSyncEnabled": {
        const connectorState = await GithubConnectorState.findOne({
          where: {
            connectorId: connector.id,
          },
        });
        if (!connectorState) {
          return new Err(
            new Error(
              `Connector state not found (connectorId: ${connector.id})`
            )
          );
        }

        await connectorState.update({
          codeSyncEnabled: configValue === "true",
        });

        // launch full-resync workflow, code sync only (to be launched on enable and disable to sync
        // or properly clean up the code).
        await launchGithubFullSyncWorkflow({
          connectorId: connector.id,
          syncCodeOnly: true,
        });

        return new Ok(void 0);
      }

      default: {
        return new Err(new Error(`Invalid config key ${configKey}`));
      }
    }
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    switch (configKey) {
      case "codeSyncEnabled": {
        const connectorState = await GithubConnectorState.findOne({
          where: {
            connectorId: connector.id,
          },
        });
        if (!connectorState) {
          return new Err(
            new Error(
              `Connector state not found (connectorId: ${connector.id})`
            )
          );
        }

        return new Ok(connectorState.codeSyncEnabled.toString());
      }
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }
    await connector.markAsPaused();
    await terminateAllWorkflowsForConnectorId(this.connectorId);
    return new Ok(undefined);
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }
    await connector.markAsUnpaused();
    await launchGithubFullSyncWorkflow({
      connectorId: this.connectorId,
      syncCodeOnly: false,
    });

    return new Ok(undefined);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    return new Err(
      new Error(`Setting Github connector permissions is not implemented yet.`)
    );
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
