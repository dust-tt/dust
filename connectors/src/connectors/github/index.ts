import type { Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";

import {
  getRepo,
  getReposPage,
  installationIdFromConnectionId,
} from "@connectors/connectors/github/lib/github_api";
import {
  getCodeRootInternalId,
  getDiscussionsInternalId,
  getDiscussionsUrl,
  getIssuesInternalId,
  getIssuesUrl,
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
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
} from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { MIME_TYPES } from "@connectors/types";

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
      const connectorState = await GithubConnectorState.findOne({
        where: {
          connectorId: c.id,
        },
      });

      const newGithubInstallationId =
        await installationIdFromConnectionId(connectionId);

      if (connectorState?.installationId !== newGithubInstallationId) {
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

    if (!parentInternalId) {
      // No parentInternalId: we return the repositories.

      let nodes: ContentNode[] = [];
      let pageNumber = 1; // 1-indexed
      for (;;) {
        const pageRes = await getReposPage(c, pageNumber);

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
            mimeType: MIME_TYPES.GITHUB.REPOSITORY,
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
              getRepo(c, repoId),
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
              type: "folder",
              title: "Issues",
              sourceUrl: getIssuesUrl(repo.url),
              expandable: false,
              permission: "read",
              lastUpdatedAt: latestIssue.updatedAt.getTime(),
              mimeType: MIME_TYPES.GITHUB.ISSUES,
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
              mimeType: MIME_TYPES.GITHUB.DISCUSSIONS,
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
              mimeType: MIME_TYPES.GITHUB.CODE_ROOT,
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
              mimeType: MIME_TYPES.GITHUB.CODE_DIRECTORY,
            });
          });

          files.forEach((file) => {
            nodes.push({
              internalId: file.documentId,
              parentInternalId,
              type: "document",
              title: file.fileName,
              sourceUrl: file.sourceUrl,
              expandable: false,
              permission: "read",
              lastUpdatedAt: file.codeUpdatedAt.getTime(),
              mimeType: MIME_TYPES.GITHUB.CODE_FILE,
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

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement this.
    return new Ok([internalId]);
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

      case "useProxy": {
        await connector.update({
          useProxy: configValue === "true",
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
      case "useProxy": {
        return new Ok(connector.useProxy?.toString() ?? "false");
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
