import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import { Op } from "sequelize";

import type { GithubRepo } from "@connectors/connectors/github/lib/github_api";
import {
  getRepo,
  getReposPage,
  installationIdFromConnectionId,
} from "@connectors/connectors/github/lib/github_api";
import {
  getGithubCodeDirectoryParentIds,
  getGithubCodeFileParentIds,
} from "@connectors/connectors/github/lib/hierarchy";
import {
  getCodeRootInternalId,
  getDiscussionInternalId,
  getDiscussionsInternalId,
  getDiscussionsUrl,
  getDiscussionUrl,
  getGithubIdsFromDiscussionInternalId,
  getGithubIdsFromIssueInternalId,
  getIssueInternalId,
  getIssuesInternalId,
  getIssuesUrl,
  getIssueUrl,
  getRepositoryInternalId,
  matchGithubInternalIdType,
} from "@connectors/connectors/github/lib/utils";
import { launchGithubFullSyncWorkflow } from "@connectors/connectors/github/temporal/client";
import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
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
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
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
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error("Connector not found");
    }

    if (connectionId) {
      const [oldGithubInstallationId, newGithubInstallationId] =
        await Promise.all([
          installationIdFromConnectionId(c.connectionId),
          installationIdFromConnectionId(connectionId),
        ]);

      if (oldGithubInstallationId !== newGithubInstallationId) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change the Installation Id of a Github Data Source"
          )
        );
      }

      await c.update({ connectionId });

      // If connector was previously paused, unpause it.
      if (c.isPaused()) {
        await this.unpause();
      }

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
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const connectionId = c.connectionId;

    if (!parentInternalId) {
      // No parentInternalId: we return the repositories.

      let nodes: ContentNode[] = [];
      let pageNumber = 1; // 1-indexed
      for (;;) {
        const pageRes = await getReposPage(connectionId, pageNumber);

        if (pageRes.isErr()) {
          return new Err(
            new ConnectorManagerError(
              "EXTERNAL_OAUTH_TOKEN_ERROR",
              pageRes.error.message
            )
          );
        }

        const page = pageRes.value;
        pageNumber += 1;
        if (page.length === 0) {
          break;
        }

        nodes = nodes.concat(
          page.map((repo) => ({
            internalId: getRepositoryInternalId(repo.id),
            parentInternalId: null,
            type: "folder",
            title: repo.name,
            sourceUrl: repo.url,
            expandable: true,
            permission: "read",
            lastUpdatedAt: null,
          }))
        );
      }

      nodes.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(nodes);
    } else {
      const { type, repoId } = matchGithubInternalIdType(parentInternalId);
      if (isNaN(repoId)) {
        return new Err(
          new ConnectorManagerError(
            "INVALID_PARENT_INTERNAL_ID",
            `Invalid parentInternalId Github repoId: ${parentInternalId}`
          )
        );
      }

      switch (type) {
        case "REPO_FULL": {
          const [latestDiscussion, latestIssue, repoRes, codeRepo] =
            await Promise.all([
              GithubDiscussion.findOne({
                where: {
                  connectorId: c.id,
                  repoId: repoId.toString(),
                },
                order: [["updatedAt", "DESC"]],
              }),
              GithubIssue.findOne({
                where: {
                  connectorId: c.id,
                  repoId: repoId.toString(),
                },
                order: [["updatedAt", "DESC"]],
              }),
              getRepo(connectionId, repoId),
              GithubCodeRepository.findOne({
                where: {
                  connectorId: c.id,
                  repoId: repoId.toString(),
                },
              }),
            ]);

          if (repoRes.isErr()) {
            return new Err(
              new ConnectorManagerError(
                "EXTERNAL_OAUTH_TOKEN_ERROR",
                repoRes.error.message
              )
            );
          }

          const repo = repoRes.value;

          const nodes: ContentNode[] = [];

          if (latestIssue) {
            nodes.push({
              internalId: getIssuesInternalId(repoId),
              parentInternalId,
              type: "database",
              title: "Issues",
              sourceUrl: getIssuesUrl(repo.url),
              expandable: false,
              permission: "read",
              lastUpdatedAt: latestIssue.updatedAt.getTime(),
            });
          }

          if (latestDiscussion) {
            nodes.push({
              internalId: getDiscussionsInternalId(repoId),
              parentInternalId,
              type: "folder",
              title: "Discussions",
              sourceUrl: getDiscussionsUrl(repo.url),
              expandable: false,
              permission: "read",
              lastUpdatedAt: latestDiscussion.updatedAt.getTime(),
            });
          }

          if (codeRepo) {
            nodes.push({
              internalId: getCodeRootInternalId(repoId),
              parentInternalId,
              type: "folder",
              title: "Code",
              sourceUrl: repo.url,
              expandable: true,
              permission: "read",
              lastUpdatedAt: codeRepo.codeUpdatedAt.getTime(),
            });
          }

          return new Ok(nodes);
        }
        case "REPO_CODE":
        case "REPO_CODE_DIR": {
          const [files, directories] = await Promise.all([
            GithubCodeFile.findAll({
              where: {
                connectorId: c.id,
                parentInternalId,
              },
            }),
            GithubCodeDirectory.findAll({
              where: {
                connectorId: c.id,
                parentInternalId,
              },
            }),
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
              internalId: directory.internalId,
              parentInternalId,
              type: "folder",
              title: directory.dirName,
              sourceUrl: directory.sourceUrl,
              expandable: true,
              permission: "read",
              lastUpdatedAt: directory.codeUpdatedAt.getTime(),
            });
          });

          files.forEach((file) => {
            nodes.push({
              internalId: file.documentId,
              parentInternalId,
              type: "file",
              title: file.fileName,
              sourceUrl: file.sourceUrl,
              expandable: false,
              permission: "read",
              lastUpdatedAt: file.codeUpdatedAt.getTime(),
            });
          });

          return new Ok(nodes);
        }
        // we should never be getting issues, discussions, code files, single issues or discussions as parent
        case "REPO_ISSUES":
        case "REPO_DISCUSSIONS":
        case "REPO_CODE_FILE":
        case "REPO_DISCUSSION":
        case "REPO_ISSUE":
          return new Err(
            new ConnectorManagerError(
              "INVALID_PARENT_INTERNAL_ID",
              `Invalid parentInternalId Github type: ${type}`
            )
          );
        default:
          assertNever(type);
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

    //  Single issues or discussions
    const issueIds: { repoId: string; issueNumber: number }[] = [];
    const discussionIds: { repoId: string; discussionNumber: number }[] = [];

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
        case "REPO_DISCUSSION":
          discussionIds.push(getGithubIdsFromDiscussionInternalId(internalId));
          break;
        case "REPO_ISSUE":
          issueIds.push(getGithubIdsFromIssueInternalId(internalId));
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
        const repoRes = await getRepo(connectionId, repoId);
        if (repoRes.isErr()) {
          // We need to throw the error to stop the execution of the concurrentExecutor.
          throw repoRes.error;
        }

        uniqueRepos[repoId] = repoRes.value;
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

    // Issues and Discussions are also stored in the db
    const [issues, discussions] = await Promise.all([
      GithubIssue.findAll({
        where: {
          connectorId: c.id,
          [Op.or]: issueIds,
        },
      }),
      GithubDiscussion.findAll({
        where: {
          connectorId: c.id,
          [Op.or]: discussionIds,
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
        internalId: getRepositoryInternalId(repoId),
        parentInternalId: null,
        type: "folder",
        title: repo.name,
        sourceUrl: repo.url,
        expandable: true,
        permission: "read",
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
        internalId: getIssuesInternalId(repoId),
        parentInternalId: getRepositoryInternalId(repoId),
        type: "database",
        title: "Issues",
        sourceUrl: getIssuesUrl(repo.url),
        expandable: false,
        permission: "read",
        lastUpdatedAt: null,
      });
    });
    allDiscussionsFromRepoIds.forEach((repoId) => {
      const repo = uniqueRepos[repoId];
      if (!repo) {
        return;
      }
      nodes.push({
        internalId: getDiscussionsInternalId(repoId),
        parentInternalId: getRepositoryInternalId(repoId),
        type: "folder",
        title: "Discussions",
        sourceUrl: getDiscussionsUrl(repo.url),
        expandable: false,
        permission: "read",
        lastUpdatedAt: null,
      });
    });

    issues.forEach((issue) => {
      const { repoId, issueNumber } = issue;
      const repo = uniqueRepos[parseInt(repoId, 10)];
      if (!repo) {
        return;
      }
      nodes.push({
        internalId: getIssueInternalId(repoId, issueNumber),
        parentInternalId: getIssuesInternalId(repoId),
        type: "file",
        title: `Issue #${issueNumber}`,
        sourceUrl: getIssueUrl(repo.url, issueNumber),
        expandable: false,
        permission: "read",
        lastUpdatedAt: issue.updatedAt.getTime(),
      });
    });

    discussions.forEach((discussion) => {
      const { repoId, discussionNumber } = discussion;
      const repo = uniqueRepos[parseInt(repoId, 10)];
      if (!repo) {
        return;
      }
      nodes.push({
        internalId: getDiscussionInternalId(repoId, discussionNumber),
        parentInternalId: getDiscussionsInternalId(repoId),
        type: "file",
        title: `Discussion #${discussionNumber}`,
        sourceUrl: getDiscussionUrl(repo.url, discussionNumber),
        expandable: false,
        permission: "read",
        lastUpdatedAt: discussion.updatedAt.getTime(),
      });
    });

    // Constructing Nodes for Code
    fullCodeInRepos.forEach((codeRepo) => {
      nodes.push({
        internalId: getCodeRootInternalId(codeRepo.repoId),
        parentInternalId: getRepositoryInternalId(codeRepo.repoId),
        type: "folder",
        title: "Code",
        sourceUrl: codeRepo.sourceUrl,
        expandable: true,
        permission: "read",
        lastUpdatedAt: codeRepo.codeUpdatedAt.getTime(),
      });
    });

    // Constructing Nodes for Code Directories
    codeDirectories.forEach((directory) => {
      nodes.push({
        internalId: directory.internalId,
        parentInternalId: directory.parentInternalId,
        type: "folder",
        title: directory.dirName,
        sourceUrl: directory.sourceUrl,
        expandable: true,
        permission: "read",
        lastUpdatedAt: directory.codeUpdatedAt.getTime(),
      });
    });

    // Constructing Nodes for Code Files
    codeFiles.forEach((file) => {
      nodes.push({
        internalId: file.documentId,
        parentInternalId: file.parentInternalId,
        type: "file",
        title: file.fileName,
        sourceUrl: file.sourceUrl,
        expandable: false,
        permission: "read",
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
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    const { type, repoId } = matchGithubInternalIdType(internalId);

    switch (type) {
      case "REPO_FULL": {
        return new Ok([internalId]);
      }
      case "REPO_ISSUES":
      case "REPO_DISCUSSIONS": {
        return new Ok([internalId, getRepositoryInternalId(repoId)]);
      }
      case "REPO_CODE": {
        return new Ok([internalId, getRepositoryInternalId(repoId)]);
      }
      case "REPO_CODE_DIR": {
        const parents = await getGithubCodeDirectoryParentIds(
          connector.id,
          internalId,
          repoId
        );
        return new Ok([internalId, ...parents]);
      }
      case "REPO_CODE_FILE": {
        const parents = await getGithubCodeFileParentIds(
          connector.id,
          internalId,
          repoId
        );
        return new Ok([internalId, ...parents]);
      }
      case "REPO_ISSUE":
        return new Ok([
          internalId,
          getIssuesInternalId(repoId),
          getRepositoryInternalId(repoId),
        ]);
      case "REPO_DISCUSSION":
        return new Ok([
          internalId,
          getDiscussionsInternalId(repoId),
          getRepositoryInternalId(repoId),
        ]);
      default: {
        assertNever(type);
      }
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
